"""
End-to-end orchestration: raw files in, resolved+enriched candidates out.

This is the piece that was missing — every prior module (normalize_sruk,
normalize_verra, match, normalize_brwa) was tested individually or in
hand-wired scripts, but nothing ran the whole thing as one callable unit.
"""
import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from .normalize_sruk import normalize_sruk_record
from .normalize_verra import normalize_verra_record
from .normalize_brwa import (
    parse_brwa_list, prefilter_by_admin, load_brwa_territory, load_brwa_directory,
    attach_brwa_evidence, translate_province_to_indonesian,
)
from .match import resolve_candidates, flag_implausible_single_source_geo
from .news_matching import process_hit, apply_corroboration, new_thin_candidate_from_hit
from .contact_resolution import resolve_contact_tier_b
from .scoring import score_candidate
from .dossier import build_dossier
from .activity_type import classify_activity_type
from .schema import RegistrantContact

# contact_source values a registry-only run (no tavily_client) can never
# itself produce — see run_pipeline()'s preserve_contacts_by_registry_key
# docstring. Tier A ('sruk_registrant' / 'srn_ppi_registrant') is
# recomputed fresh and correctly from raw registry data on every run, so
# it's deliberately never in this set: a preserved value must never be
# allowed to shadow a fresh, correct Tier A hit.
PRESERVABLE_CONTACT_SOURCES = {"org_website", "manual_review"}

# The fields of UnifiedCandidateRecord.registry_ids that are genuinely
# stable across separate run_pipeline() invocations — each is the
# registry's OWN identifier, read straight from the raw source file every
# time. candidate_id itself is NOT stable (see preserve_contacts_by_
# registry_key's docstring) and must never be used as this kind of key.
REGISTRY_ID_FIELDS = ("sruk_registry_no", "srn_ppi_registry_no", "verra_project_id")


def _registry_keys(registry_ids: dict) -> list:
    """Every non-null registry id on a candidate, as stable lookup keys
    ('verra_project_id:674', ...). A cross-registry merged candidate (e.g.
    Katingan: sruk+srn_ppi+verra all merged into one) can have more than
    one of these set at once — matching against ANY one of them is
    enough, since they all identify the same real underlying record."""
    return [f"{field}:{registry_ids[field]}" for field in REGISTRY_ID_FIELDS if (registry_ids or {}).get(field)]


def _is_forestry_sector(sector: str) -> bool:
    if not sector:
        return False
    s = sector.lower()
    return "forestry" in s or "afolu" in s or "folu" in s


# Confirmed on real data (2026-08-26): SRUK/SRN-PPI's own raw registry
# contains literal test/demo submissions — e.g. org "PT. UJI COBA" ("uji
# coba" = "test/trial"), a project titled "...DUMMY 2026", org "dummy",
# "Test Kegiatan 4 desember 2025 galuh" — present in the RAW source data
# itself, not introduced anywhere in this pipeline. Several form a tight
# cluster (created within ~3 minutes of each other on 2025-10-27, sharing
# near-identical boilerplate description text and in some cases the exact
# same KNOWN_PLACEHOLDER_COORDS value normalize_sruk.py already treats as
# fake) but don't carry a literal keyword — that cluster is NOT caught
# here; it would need a fuzzy/behavioral detector this project doesn't
# have yet, and building one risks false-positiving on legitimately
# similar template-guided submissions. This filter only removes what it
# can positively confirm: an explicit test/placeholder word in the
# project's own name or organization name. Checked directly against a
# lookalike case before relying on this - "Direktorat Konservasi
# Ekosistem2" (trailing digit, looks like a duplicate) turned out to be a
# real, distinct government submission on investigation, not test data,
# and correctly does NOT match this pattern.
TEST_DATA_PATTERN = re.compile(r"\buji\s*coba\b|\bdummy\b|\btest(?:ing)?\b|\bcontoh\b|\bsample\b|\bpercobaan\b",
                                re.IGNORECASE)


def _is_test_or_placeholder(rec) -> bool:
    haystack = f"{rec.name or ''} {rec.org or ''}"
    return bool(TEST_DATA_PATTERN.search(haystack))


@dataclass
class PipelineResult:
    candidates: list = field(default_factory=list)
    tentative_links: list = field(default_factory=list)
    brwa_coverage_gaps: dict = field(default_factory=dict)   # candidate name -> [nearby BRWA idx we have no geometry for]
    skipped_non_forestry: list = field(default_factory=list) # (path, sector) pairs excluded by the sector filter
    skipped_non_indonesia: list = field(default_factory=list) # (path, country) pairs excluded by the country filter (Verra only — SRUK/SRN-PPI are Indonesia's own registries, verified against real data, no filter needed there)
    skipped_test_data: list = field(default_factory=list)    # (path, name, org) triples excluded as confirmed test/placeholder submissions
    skipped_duplicate_raw: list = field(default_factory=list) # (path, source, registry_no, first_seen_path) quads — the same registry record scraped/saved into both sruk/raw_details/ and srn_ppi/raw_details/ under the same filename (confirmed real, 2026-08-27: 72 of 283 SRUK+SRN-PPI raw files were such duplicates, all classifying to the SAME source via _detect_source() despite living in different directories — not a legitimate SRUK-native+SRN-PPI-native pair, a genuine raw-data duplication that was inflating merge_history with a redundant identical entry on 54 of 128 real candidates, though it never produced a double-counted final candidate since resolve_candidates() always auto_merged the exact-duplicate pair at 100%)
    errors: list = field(default_factory=list)               # (path, error message) pairs
    news_actions: list = field(default_factory=list)         # what happened to each news hit processed
    scores: dict = field(default_factory=dict)               # candidate_id -> score_candidate() output
    dossiers: dict = field(default_factory=dict)              # candidate_id -> build_dossier() output
    activity_types: dict = field(default_factory=dict)       # candidate_id -> classify_activity_type() output
    stats: dict = field(default_factory=dict)


def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _compute_data_freshness(source_freshness: dict, reference_date: date) -> dict:
    """
    Purely additive stats — turns already-known fetch timestamps into an
    age_days figure, nothing more. Does NOT read any file itself (the
    caller, e.g. orchestrate.py, already knows each source's own
    fetched_at-style timestamp and passes it straight in as a string) —
    keeping this file-I/O-free is what makes it safe to leave out entirely
    (source_freshness=None, the default) without changing any existing
    caller's behavior, and keeps run_pipeline() itself making no assumption
    about where any source's metadata file lives.
    """
    out = {}
    for source, info in (source_freshness or {}).items():
        info = info if isinstance(info, dict) else {"fetched_at": info}
        fetched_at = info.get("fetched_at")
        entry = {"fetched_at": fetched_at, "age_days": None}
        if fetched_at:
            try:
                dt = datetime.fromisoformat(str(fetched_at).replace("Z", "+00:00"))
                entry["age_days"] = (reference_date - dt.date()).days
            except ValueError:
                entry["note"] = "fetched_at present but unparseable"
        else:
            entry["note"] = "no fetched_at available for this source"
        for k, v in info.items():
            if k != "fetched_at":
                entry.setdefault(k, v)
        out[source] = entry
    return out


def run_pipeline(sruk_files: list, verra_files: list, brwa_list_path: str,
                  brwa_geojson_dir: str = None, brwa_profile_dir: str = None,
                  brwa_profile_geojson_pairs: list = None,
                  filter_to_forestry: bool = True, filter_to_indonesia: bool = True,
                  filter_test_data: bool = True,
                  brwa_near_threshold_km: float = 10.0,
                  tavily_client=None, news_queries: list = None,
                  news_hits_override: dict = None, run_scoring: bool = True,
                  resolve_contacts_tier_b: bool = False, run_dossiers: bool = True,
                  source_freshness: dict = None, reference_date: date = None,
                  preserve_contacts_by_registry_key: dict = None) -> PipelineResult:
    """
    filter_test_data: drops candidates whose own name/org contains an
      explicit test/placeholder keyword ("uji coba", "dummy", "test",
      "contoh", "sample", "percobaan") — see TEST_DATA_PATTERN's comment
      for the real cases (SRUK/SRN-PPI's own raw registry data, not
      introduced by this pipeline) that made this necessary. Deliberately
      keyword-only, not a behavioral/timing heuristic — see the comment
      for why a broader detector was considered and not built. Defaults to
      True, matching filter_to_forestry/filter_to_indonesia's opt-out design.
    source_freshness: optional {source_name: {"fetched_at": "<iso timestamp>",
      ...}} — surfaces data-freshness visibility in result.stats["data_freshness"]
      (fetched_at + computed age_days per source). Purely additive: this
      function does no file I/O for it and makes no assumption about where
      any source's metadata lives — the caller (e.g. orchestrate.py, which
      already resolves each source's own fetched_at-style timestamp to
      decide whether to re-scrape) passes already-known values straight in.
      Defaults to None, in which case result.stats["data_freshness"] is an
      empty dict — every existing caller of run_pipeline() is unaffected.
    reference_date: what "today" means for age_days math above ONLY —
      scoped strictly to source_freshness. Does NOT affect
      compliance.py's own deadline checks (score_candidate() still calls
      evaluate_compliance(candidate) with its own default of date.today();
      wiring reference_date through to that too is a separate change this
      instruction didn't ask for). Defaults to date.today().
    filter_to_indonesia: drops Verra candidates whose normalized `country`
      isn't "ID" (Verra's catalog is global, not Indonesia-only — confirmed
      on real data: 97.6% of Verra forestry-sector candidates were some
      other country). Applies to Verra only; SRUK/SRN-PPI are Indonesia's
      own government registries and were checked directly against real data
      (every actual province value across 283 real records is a genuine
      Indonesian province) — no equivalent risk there, so no filter needed.
      Defaults to True, matching filter_to_forestry's opt-out design.
    run_dossiers: builds a template dossier (dossier.build_dossier) for
      every final candidate, keyed by candidate_id, in result.dossiers.
      Deterministic and cheap (no LLM, no network) — defaults to True,
      unlike the Tavily-dependent steps. Requires run_scoring=True, since
      the dossier reads directly from the score dict.
    resolve_contacts_tier_b: if True AND tavily_client is provided, runs
      Tier B (org-website) contact resolution for every candidate that
      doesn't already have a Tier A contact. Defaults to False — this
      costs a real Tavily search credit per candidate lacking Tier A, so
      it's opt-in rather than run automatically on every pipeline call.
    preserve_contacts_by_registry_key: optional {registry_key: contact_dict}
      — a snapshot of a PRIOR run's resolved contacts (same shape as
      dataclasses.asdict(RegistrantContact), i.e. detail_json["contact"]
      from a previous export), keyed by a STABLE registry identifier
      string ('verra_project_id:674', 'sruk_registry_no:...', etc. — see
      _registry_keys()), NOT by candidate_id. CONFIRMED real bug
      (2026-08-30 health-check sweep, root-caused 2026-08-31): a
      registry-only run (no tavily_client, the normal unattended
      scheduler.py cadence) can never reproduce a Tier B ('org_website') or
      human-reviewed ('manual_review') contact — those aren't derivable
      from raw registry data at all. Without this, re-running the pipeline
      on unchanged raw data SILENTLY ERASES any such contact a prior richer
      run had found, because run_pipeline() always rebuilds candidates from
      scratch. candidate_id is deliberately NOT used as the key here: it is
      NOT stable across separate run_pipeline() invocations (schema.py's
      UnifiedCandidateRecord assigns a fresh uuid4() to every record on
      every construction, and nothing downstream overrides it
      deterministically) — empirically confirmed the same real record gets
      a different candidate_id on every rerun of identical raw data, which
      would make a candidate_id-keyed version of this fix silently match
      nothing. registry_ids (the registry's own identifier) IS stable
      across runs, so that's the join key instead. When provided, any
      final candidate with NO registrant_contact of its own (Tier A always
      wins and is recomputed correctly every time, so this never shadows a
      fresh Tier A hit) whose registry_ids matches a preserved entry has
      that prior org_website/manual_review contact restored, and
      result.stats["contacts_preserved_from_prior_export"] counts how many
      — surfaced, never a silent recovery. A candidate with no registry_ids
      at all (a thin/news-sourced candidate) can never match here — those
      aren't recreated by a registry-only run in the first place (a
      separate, pre-existing, already-documented limitation — see
      scheduler.py's last_registry_refresh vs last_full_refresh_with_news
      — out of scope for this fix). Defaults to None, in which case
      behavior is identical to before this param existed — every existing
      caller/test is unaffected.
    tavily_client: a TavilyClient instance — if provided, news_queries are
      actually searched live. NOT tested from this environment (no network
      access to api.tavily.com here) — smoke-test the live call yourself.
    news_queries: list of query strings to run (build with news_matching.build_queries()).
      Ignored if tavily_client is None and news_hits_override is None.
    news_hits_override: dict of {query: [hit, hit, ...]} — bypasses the live
      API entirely, for testing the matching/scoring wiring with known
      inputs (this is how this function is validated in this environment).
    run_scoring: attaches scoring.score_candidate() output to every final
      candidate, keyed by candidate_id, in result.scores.
    """
    reference_date = reference_date or date.today()
    result = PipelineResult()
    project_records = []

    # --- Step 1: normalize SRUK/SRN-PPI ---
    # Dedup guard: the SRUK and SRN-PPI scrapers can independently save the
    # SAME underlying registry record (same program_code) into BOTH
    # sruk/raw_details/ and srn_ppi/raw_details/ under the same filename —
    # confirmed real on 2026-08-27 data, 72 of 283 raw files. Both copies
    # classify to the SAME source via normalize_sruk._detect_source()
    # (username-based, independent of which directory scraped them), so
    # without this guard they'd both flow into identity resolution as
    # separate inputs and auto_merge together at a perfect 100% score,
    # leaving a redundant duplicate entry in merge_history (confirmed on
    # 54 of 128 real candidates) — cosmetic there (resolve_candidates()
    # always merged them into ONE final candidate, never a double-counted
    # row), but confusing on an identity-resolution audit trail that's
    # supposed to show genuinely distinct sources.
    #
    # Keyed on (source, registry_no, raw internal id) — NOT registry_no
    # alone. registry_no (program_code) is the registry's own identifier
    # and collision across two genuinely different real submissions would
    # be a serious bug on the registry's own side, but nothing here proves
    # that can never happen, so it alone isn't trusted as a collision-proof
    # key. The raw payload's own `id` field (a UUID the registry assigns,
    # independent of program_code) is required to also match — confirmed
    # necessary on real data, not just theoretical caution: 2 of the 72
    # program_code-overlap pairs have a DIFFERENT `responsible.name` (org)
    # between the two scrapes of the same record (one is a harmless casing
    # difference; the other, "Thryve earth" vs "KOPERASI MULTIPIHAK
    # RESTORASI LANSKAP HUTAN SULAWESI", is a real, substantive difference
    # — the registry's own "responsible party" field was apparently edited
    # between the two scrape snapshots). Both still share the identical
    # internal `id`, confirming they're the same underlying submission
    # despite the org-field drift — so an org/name content check would
    # have WRONGLY treated this genuine duplicate as two different real
    # records. The registry-assigned internal id is the reliable signal;
    # confirmed present and non-null on all 283 real SRUK/SRN-PPI raw
    # files, so requiring it never silently degrades to "always skip."
    # This also means a legitimate SRUK-native + SRN-PPI-native pair for
    # the same real project (e.g. Katingan's actual cross-registry merge,
    # which this dedup guard must never touch) is never misclassified as a
    # duplicate: that pair carries two DIFFERENT registry_no values
    # (sruk_registry_no vs srn_ppi_registry_no), so the dedup key never
    # matches between them in the first place — dedup only fires on an
    # EXACT (source, registry_no) match, which a legitimate cross-registry
    # pair never has.
    seen_registry_keys = {}
    for path in sruk_files:
        try:
            raw = _load_json(path)
            rec = normalize_sruk_record(raw)
        except Exception as e:
            result.errors.append((path, f"SRUK normalize failed: {e}"))
            continue
        if filter_to_forestry and not _is_forestry_sector(rec.sector):
            result.skipped_non_forestry.append((path, rec.sector))
            continue
        if filter_test_data and _is_test_or_placeholder(rec):
            result.skipped_test_data.append((path, rec.name, rec.org))
            continue
        reg_no = rec.registry_ids.get(f"{rec.primary_source}_registry_no")
        raw_internal_id = raw.get("id")
        dedup_key = (rec.primary_source, reg_no, raw_internal_id) if (reg_no and raw_internal_id) else None
        if dedup_key and dedup_key in seen_registry_keys:
            result.skipped_duplicate_raw.append((path, rec.primary_source, reg_no, seen_registry_keys[dedup_key]))
            continue
        if dedup_key:
            seen_registry_keys[dedup_key] = path
        project_records.append(rec)

    # --- Step 2: normalize Verra ---
    for path in verra_files:
        try:
            raw = _load_json(path)
            rec = normalize_verra_record(raw)
        except Exception as e:
            result.errors.append((path, f"Verra normalize failed: {e}"))
            continue
        if filter_to_forestry and not _is_forestry_sector(rec.sector):
            result.skipped_non_forestry.append((path, rec.sector))
            continue
        if filter_to_indonesia and rec.country != "ID":
            result.skipped_non_indonesia.append((path, rec.country))
            continue
        if filter_test_data and _is_test_or_placeholder(rec):
            result.skipped_test_data.append((path, rec.name, rec.org))
            continue
        project_records.append(rec)

    # --- Step 3: identity resolution (SRUK <-> SRN-PPI <-> Verra) ---
    final_candidates, tentative_links = resolve_candidates(project_records)
    result.tentative_links = tentative_links

    # --- Step 3.5: single-source Verra geo plausibility guard. Must run
    # here — AFTER resolution (so "single-source" is known) and BEFORE
    # Step 5 (BRWA overlap) and scoring, both of which trust
    # candidate.latitude/longitude directly. See match.py's
    # flag_implausible_single_source_geo() docstring for why this can't
    # be the existing cross-source geo_suspect check inside match_score(). ---
    for candidate in final_candidates:
        reason = flag_implausible_single_source_geo(candidate)
        if reason:
            candidate.geo_flagged_reason = reason
            candidate.latitude, candidate.longitude = None, None

    # --- Step 4: load BRWA list (cheap, always) + available geometries ---
    brwa_lookup = {}
    try:
        brwa_lookup = parse_brwa_list(_load_json(brwa_list_path))
    except Exception as e:
        result.errors.append((brwa_list_path, f"BRWA list load failed: {e}"))

    available_territories_by_idx = {}
    if brwa_geojson_dir:
        available_territories_by_idx = load_brwa_directory(brwa_geojson_dir, brwa_lookup, profile_dir=brwa_profile_dir)
    elif brwa_profile_geojson_pairs:
        for profile_path, geojson_path in brwa_profile_geojson_pairs:
            try:
                profile = _load_json(profile_path)
                geojson = _load_json(geojson_path)
                idx = profile.get("idx")
                territory = load_brwa_territory(profile, geojson, list_entry=brwa_lookup.get(idx))
                available_territories_by_idx[idx] = territory
            except Exception as e:
                result.errors.append((profile_path, f"BRWA territory load failed: {e}"))

    available_territories = list(available_territories_by_idx.values())

    # --- Step 5: attach BRWA evidence to every resolved candidate ---
    for candidate in final_candidates:
        # Pre-filter to the candidate's own province/district before the
        # geometry check — at 1756 loaded territories, checking every
        # candidate against all of them unconditionally is real wasted
        # work; the province/district prefilter (already built) narrows
        # this to the handful that could plausibly overlap.
        candidates_to_check = available_territories
        if candidate.province:
            translated_province = translate_province_to_indonesian(candidate.province)
            nearby_entries = prefilter_by_admin(translated_province, candidate.district, brwa_lookup)
            nearby_idxs = {e["idx"] for e in nearby_entries}
            candidates_to_check = [t for t in available_territories if t.idx in nearby_idxs]

            available_idxs = {t.idx for t in available_territories}
            missing = nearby_idxs - available_idxs
            if missing:
                missing_names = [brwa_lookup[i]["name"] for i in missing]
                result.brwa_coverage_gaps[candidate.name] = missing_names

        attach_brwa_evidence(candidate, candidates_to_check, near_threshold_km=brwa_near_threshold_km)

    # --- Step 6: news/campaign matching (optional — no-op if neither a
    # live client nor test hits were provided, so this never blocks the
    # rest of the pipeline from running) ---
    hits_by_query = {}
    if news_hits_override:
        hits_by_query = news_hits_override
    elif tavily_client and news_queries:
        for q in news_queries:
            try:
                response = tavily_client.search(q)
                hits_by_query[q] = response.get("results", [])
            except Exception as e:
                result.errors.append((f"tavily:{q}", f"search failed: {e}"))

    new_thin_candidates = []
    for query, hits in hits_by_query.items():
        for hit in hits:
            action = process_hit(hit, query, final_candidates + new_thin_candidates)
            result.news_actions.append({
                "query": query, "action": action["action"],
                "org_candidates": action["org_candidates"], "match_score": round(action["match_score"], 1),
                "target": action["target_candidate"].name if action["target_candidate"] else None,
            })
            if action["action"] == "corroborate":
                apply_corroboration(action["target_candidate"], action, query)
            elif action["action"] == "new_thin_candidate":
                new_thin_candidates.append(new_thin_candidate_from_hit(action, query))

    final_candidates.extend(new_thin_candidates)

    # --- Step 6b: Tier B contact resolution (opt-in — see docstring) ---
    tier_b_attempted, tier_b_resolved = 0, 0
    if resolve_contacts_tier_b and tavily_client:
        for candidate in final_candidates:
            existing_source = candidate.registrant_contact.contact_source if candidate.registrant_contact else None
            if existing_source and "registrant" in existing_source:
                continue  # Tier A already covers this one — don't spend a search credit
            tier_b_attempted += 1
            if resolve_contact_tier_b(candidate, tavily_client):
                tier_b_resolved += 1

    # --- Step 6c: restore Tier B / manual contacts a registry-only run
    # can't itself derive (see preserve_contacts_by_registry_key's
    # docstring — keyed by registry_ids, NOT candidate_id, since
    # candidate_id isn't stable across runs) ---
    contacts_preserved = 0
    if preserve_contacts_by_registry_key:
        for candidate in final_candidates:
            # Same pattern as Tier B's own existing_source check just above —
            # registrant_contact is frequently a non-None RegistrantContact
            # with contact_source=None (e.g. every Verra-sourced candidate,
            # per normalize_verra.py: "Verra gives no named individual
            # contact" but still constructs the dataclass to carry `org`).
            # `is not None` alone would wrongly treat that as "already
            # resolved" and never restore anything for Verra candidates.
            existing_source = candidate.registrant_contact.contact_source if candidate.registrant_contact else None
            if existing_source:
                continue  # never shadow a contact this run already resolved itself
            prior = None
            for key in _registry_keys(candidate.registry_ids):
                prior = preserve_contacts_by_registry_key.get(key)
                if prior:
                    break
            if not prior or prior.get("contact_source") not in PRESERVABLE_CONTACT_SOURCES:
                continue
            candidate.registrant_contact = RegistrantContact(
                name=prior.get("name"), org=prior.get("org"), email=prior.get("email"),
                contact_source=prior.get("contact_source"),
                contact_source_url=prior.get("contact_source_url"),
                contact_confidence=prior.get("contact_confidence"),
            )
            contacts_preserved += 1

    # --- Step 7: scoring (need vs. credibility, split per the design
    # decision — see conversation) ---
    if run_scoring:
        for candidate in final_candidates:
            result.scores[candidate.candidate_id] = score_candidate(candidate)

    # --- Step 8: dossier generation (deterministic template, no LLM —
    # requires scores to already exist) ---
    if run_dossiers and run_scoring:
        for candidate in final_candidates:
            result.dossiers[candidate.candidate_id] = build_dossier(candidate, result.scores[candidate.candidate_id])

    # --- Step 8b: real-activity-type classification (deterministic
    # keyword/field rules, no LLM — see activity_type.py's module
    # docstring for the real 2026-08-31 test this is built from).
    # Unconditional, cheap, no dependency on scoring/dossier. ---
    activity_type_counts = {"classified": 0, "unclassified": 0, "not_applicable": 0}
    for candidate in final_candidates:
        classification = classify_activity_type(candidate)
        result.activity_types[candidate.candidate_id] = classification
        if classification["not_applicable"]:
            activity_type_counts["not_applicable"] += 1
        elif classification["categories"]:
            activity_type_counts["classified"] += 1
        else:
            activity_type_counts["unclassified"] += 1

    result.candidates = final_candidates
    result.stats = {
        "sruk_and_srn_ppi_input": len([f for f in sruk_files]),
        "verra_input": len(verra_files),
        "skipped_non_forestry": len(result.skipped_non_forestry),
        "skipped_non_indonesia": len(result.skipped_non_indonesia),
        "skipped_test_data": len(result.skipped_test_data),
        "skipped_duplicate_raw": len(result.skipped_duplicate_raw),
        "errors": len(result.errors),
        "final_candidate_count": len(final_candidates),
        "tentative_link_count": len(tentative_links),
        "brwa_territories_available": len(available_territories),
        "brwa_territories_in_full_list": len(brwa_lookup),
        "candidates_with_brwa_overlap": sum(1 for c in final_candidates if c.brwa_overlap),
        "candidates_with_coverage_gaps": len(result.brwa_coverage_gaps),
        "news_queries_run": len(hits_by_query),
        "news_hits_processed": sum(len(h) for h in hits_by_query.values()),
        "news_thin_candidates_created": len(new_thin_candidates),
        "news_corroborations": sum(1 for a in result.news_actions if a["action"] == "corroborate"),
        "tier_b_contact_attempted": tier_b_attempted,
        "tier_b_contact_resolved": tier_b_resolved,
        "contacts_preserved_from_prior_export": contacts_preserved,
        "dossiers_generated": len(result.dossiers),
        "activity_type_classified": activity_type_counts["classified"],
        "activity_type_unclassified": activity_type_counts["unclassified"],
        "activity_type_not_applicable": activity_type_counts["not_applicable"],
        "data_freshness": _compute_data_freshness(source_freshness, reference_date),
    }
    return result
