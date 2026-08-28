"""
Identity resolution across SRUK / SRN-PPI / Verra records that describe the
same real-world project, and the merge logic that combines them into one
UnifiedCandidateRecord.

Weighting rationale (validated against the real Katingan test case):
  - When both records have REAL (non-placeholder) coordinates, geo-distance
    is by far the strongest signal (Row 1 vs Verra 1477 = 14 meters apart)
    and dominates the score.
  - When geo isn't usable (one or both sides missing/placeholder), fall back
    to org name + project name, with province as a tie-breaker via a
    static translation table (Indonesian official name -> Verra's English
    name) rather than fuzzy-matching across languages, which doesn't work.
"""
import re
from math import radians, sin, cos, sqrt, atan2
from rapidfuzz import fuzz
from .normalize_sruk import PROVINCE_LOOKUP_ID_TO_EN, _is_real_coordinate

LEGAL_AFFIXES = ["PT.", "PT ", "CV.", "CV ", "(PERSERO)", "LTD", "INC", "KOPERASI"]

# Generic placeholder values seen in real Verra data that carry no identity
# information — must NOT be scored as a mismatch against a real org name
# (confirmed on real data: Verra project 5524 lists "Multiple Project
# Proponents" for a project SRUK's record ties to one specific company).
GENERIC_ORG_PLACEHOLDERS = {"multiple project proponents", ""}


def _normalized_province(province: str):
    if not province:
        return None
    return PROVINCE_LOOKUP_ID_TO_EN.get(province.upper(), province).strip().lower()


def provinces_conflict(a, b) -> bool:
    """
    True only when BOTH sides have a KNOWN province AND that province was
    successfully translated (found as a key in PROVINCE_LOOKUP_ID_TO_EN, so
    both sides are confirmed to be compared in the same language) AND the
    translated values genuinely differ — never treat an unknown province,
    OR a province we couldn't confidently translate, as a conflict (same
    "don't default to a negative result" principle normalize_brwa.py's
    prefilter_by_admin already follows: "can't tell" must never collapse
    into "definitely elsewhere").

    Confirmed necessary on real data: with no pre-filter, resolve_candidates
    was comparing candidates across ~100 different countries (Verra's global
    AFOLU catalog has no built-in Indonesia filter) and unrelated Indonesian
    provinces, producing 2,872 tentative links — the vast majority
    cross-province or cross-country, not a genuinely reviewable queue.

    Fixed after a later audit found this was ALSO firing incorrectly for
    genuinely-same-province pairs outside PROVINCE_LOOKUP_ID_TO_EN's 3
    entries (e.g. "JAWA TENGAH" vs "Central Java" compared as raw,
    untranslated strings — always unequal). PROVINCE_LOOKUP_ID_TO_EN only
    has 3 of Indonesia's 37 provinces (see gluribridge/README.md Open Items
    #3) — the ORIGINAL BRWA-prefilter use of this table degrades gracefully
    when translation is missing (falls back to a full territory scan, just
    slower); this pre-filter did not — a translation miss silently produced
    a confident-looking conflict instead of an honest "unknown." Requiring
    translation to have actually succeeded on both sides (not just requiring
    both provinces to be non-null) restores the stated principle. This is a
    deliberately minimal, conservative fix: it does NOT expand the
    translation table, so pairs outside the 3 known provinces now fall
    through to match_score() same as before this pre-filter existed at
    all (relying on org/name/geo signals instead) rather than getting a
    partial, unreliable province signal. Quantified on real data
    (2026-08-27): of 3,671 pairs this pre-filter was skipping specifically
    because of the translation gap, only 21 were a genuine same-province
    false positive by an independent reference check — and none of those 21
    shared a matching org name, so none were a missed real duplicate; the
    practical effect on final_candidate_count/tentative_link_count was zero
    on the real candidate pool as it stood then. Left in for correctness
    going forward regardless, since province coverage will grow.
    """
    prov_a, prov_b = a.province, b.province
    if not prov_a or not prov_b:
        return False
    translated_a = prov_a.strip().upper() in PROVINCE_LOOKUP_ID_TO_EN
    translated_b = prov_b.strip().upper() in PROVINCE_LOOKUP_ID_TO_EN
    if not (translated_a and translated_b):
        return False  # couldn't confirm we're comparing like-for-like — unknown, not a conflict
    return _normalized_province(prov_a) != _normalized_province(prov_b)


def strip_legal(s: str) -> str:
    if not s:
        return ""
    s = s.upper()
    for token in LEGAL_AFFIXES:
        s = s.replace(token, "")
    s = re.sub(r"\(.*?\)", "", s)  # strip parenthetical abbreviations e.g. "(PT. RMU)"
    return re.sub(r"\s+", " ", s).strip()


def _is_generic_org(org: str) -> bool:
    return (org or "").strip().lower() in GENERIC_ORG_PLACEHOLDERS


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


# Generous on purpose — a real point right at Indonesia's land border can
# still land slightly outside a tight box due to survey precision, and this
# is a plausibility floor for candidates with NO second source to actually
# cross-check against, not a general geo filter. (min_lat, max_lat, min_lon, max_lon)
INDONESIA_BBOX = (-11.0, 6.0, 95.0, 141.0)


def flag_implausible_single_source_geo(candidate) -> str:
    """
    Guards a real gap match_score()'s geo_suspect flag (below) can't reach:
    geo_suspect only fires when TWO sources' coordinates are compared
    during matching and wildly disagree. A candidate whose ONLY source is
    Verra never goes through that comparison at all — so a bad Verra
    coordinate sails through untouched, confidently "on file" for both
    scoring.py's Geospatial credibility component and normalize_brwa.py's
    overlap check, which is worse than having no coordinate at all (an
    absent value honestly triggers "not yet available"; a wrong one
    confidently looks checked and clean).

    Confirmed real, not hypothetical: Verra project 5620 ("Carbon
    Agroforestry in Cimanuk, Progo and Brantas Watershed") carries
    latitude=7.0909, longitude=107.6689 — the South China Sea, off
    southern Vietnam — for a project explicitly named after three Java
    rivers, which should sit around -6 to -8 latitude. Traced directly to
    Verra's own raw scrape (data/raw/verra/runs/*/projects/5620.json), not
    introduced anywhere in this pipeline — the same sign-flip SHAPE as the
    already-documented Seram "+3.09 instead of -3.09" Verra case
    (PROJECT_CONTEXT.md Section 6), a different record, found via a
    different route (this project's map-rendering sanity sweep, not
    cross-source matching) — now a confirmed recurring pattern across
    Verra-derived coordinates specifically, not a one-off.

    Returns a specific, citable reason string (pipeline.py uses it to null
    the coordinate and record why — never a silent drop) when this
    candidate is single-source Verra AND its point falls outside a
    generous Indonesia bounding box. Returns None otherwise — including
    when a second source (SRUK/SRN-PPI) is present, since a genuinely
    cross-checkable candidate already has match_score()'s own geo_suspect
    path and doesn't need this narrower, single-source-only guard.
    """
    if candidate.latitude is None or candidate.longitude is None:
        return None
    is_single_source_verra = (
        bool(candidate.registry_ids.get("verra_project_id"))
        and not candidate.registry_ids.get("sruk_registry_no")
        and not candidate.registry_ids.get("srn_ppi_registry_no")
    )
    if not is_single_source_verra:
        return None
    min_lat, max_lat, min_lon, max_lon = INDONESIA_BBOX
    if min_lat <= candidate.latitude <= max_lat and min_lon <= candidate.longitude <= max_lon:
        return None
    return (
        f"Single-source Verra coordinate ({candidate.latitude}, {candidate.longitude}) falls outside "
        f"Indonesia's real bounding box ({min_lat} to {max_lat} lat, {min_lon} to {max_lon} lon) with no "
        f"SRUK/SRN-PPI cross-check available to verify it — treated as not yet available rather than "
        f"trusted, same principle as a known placeholder coordinate (see normalize_sruk.py's "
        f"KNOWN_PLACEHOLDER_COORDS)."
    )


def detect_latitude_sign_flip(a, b, collapsed_threshold_km=50.0) -> str:
    """
    Given a pair already flagged geo_suspect (large cross-source distance
    despite strong independent org/name/desc evidence they describe the
    SAME real project — see match_score()'s geo_suspect branch, which is
    exactly the safety condition that makes this check safe to run: a
    coincidental geographic collapse between two UNRELATED candidates
    would never reach here, since geo_suspect itself already requires
    strong_non_geo evidence first), tests the SPECIFIC, narrow signature
    of a latitude sign error: does negating one side's latitude collapse
    the distance to within real survey-precision range?

    This is deliberately narrower than "any two candidates with a large
    geo_suspect distance are miscoded" — confirmed on real data that the
    two are NOT the same failure mode:
      - Seram Climate and Conservation / SERCOVA (SRUK -3.27, Verra
        +3.09): negating Verra's latitude collapses 707.2km -> 20.1km,
        i.e. actually the same real place, just a dropped minus sign.
      - Tanimbar / Gunung Mas Community Forest Restoration (both real
        Asia Assets Developments Co. Ltd. projects, ~1993km apart):
        negating EITHER side's latitude makes the distance WORSE
        (1993.4km -> 2095.1km) — these are genuinely two different real
        places sharing one org name, already investigated and correctly
        left unmerged (PROJECT_CONTEXT.md Section 6). Nulling either
        coordinate here would be actively wrong, not just unnecessary.

    IMPORTANT, found the hard way (first version of this function): the
    distance-collapse test alone is symmetric — for a genuine mirror-image
    pair, negating EITHER side collapses the distance equally (that's what
    "mirror image" means), so testing "does flipping A work? then does
    flipping B work?" just returns whichever side happens to be checked
    first, regardless of which side is ACTUALLY wrong. Confirmed real on
    the Seram/SERCOVA case itself: the first version of this function
    nulled SRUK's correct -3.27 latitude instead of Verra's wrong +3.09,
    because SRUK was checked first ('a') and negating a correct coordinate
    to match a wrong one collapses the distance just as validly, from a
    pure-distance point of view, as the reverse. Distance alone cannot
    disambiguate which side is wrong — an independent signal is required.

    That signal: every latitude sign-flip actually found this session
    (project 5620, project 5283/SERCOVA) was in VERRA's own raw scrape
    specifically; SRUK/SRN-PPI has no confirmed instance. So only the
    LOWER-PRIORITY source in a pair (per SOURCE_PRIORITY: sruk > srn_ppi >
    verra > news — the same ranking merge_records() already uses to pick
    which side is more authoritative) is ever tested for a flip; the
    higher-priority side is never the one blamed. Two same-priority
    sources (e.g. two Verra records) have no such basis to prefer one over
    the other, so they're left alone rather than guessed at.

    Returns 'a' or 'b' (which side's latitude looks sign-flipped) or None
    (either no independent basis to pick a side, or the distance isn't
    explained by a sign error at all — leave both alone either way).
    """
    if a.latitude is None or a.longitude is None or b.latitude is None or b.longitude is None:
        return None
    a_priority = SOURCE_PRIORITY.get(a.primary_source, 0)
    b_priority = SOURCE_PRIORITY.get(b.primary_source, 0)
    if a_priority == b_priority:
        return None
    suspect_is_a = a_priority < b_priority
    suspect, trusted = (a, b) if suspect_is_a else (b, a)
    original = haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
    flipped = haversine_km(-suspect.latitude, suspect.longitude, trusted.latitude, trusted.longitude)
    if flipped <= collapsed_threshold_km and flipped < original:
        return "a" if suspect_is_a else "b"
    return None


def has_conflicting_evidence(a, b) -> tuple[bool, list]:
    """
    Checks for concrete, confident evidence that two records describe
    DIFFERENT real-world projects, even if other signals (org, description)
    suggest a match. Confirmed necessary on real data: two genuinely
    different sites run by the same organization can share a byte-identical
    boilerplate description (a shared grant-proposal template), which would
    otherwise auto-merge them incorrectly.

    District comparison is gated to sources that share the same clean
    administrative-name format (SRUK/SRN-PPI both use official BPS-style
    kecamatan names). Confirmed necessary on real data: Verra's district-ish
    field is free-text prose at a different granularity (e.g. "Katingan and
    Kotawaringin Timur districts") and will false-positive against a clean
    kecamatan name (e.g. "Mentawa Baru Ketapang") even when both correctly
    describe the same real project — that's a formatting mismatch, not
    contradicting evidence.

    Returns (has_conflict, list_of_reasons). A conflict caps the score
    below the auto-merge threshold regardless of how strong other signals are.
    """
    reasons = []
    clean_admin_sources = {"sruk", "srn_ppi"}
    district_comparable = a.primary_source in clean_admin_sources and b.primary_source in clean_admin_sources

    if district_comparable and a.district and b.district and a.district.strip().lower() != b.district.strip().lower():
        reasons.append(f"district differs: '{a.district}' vs '{b.district}'")

    # Same reasoning as district: 'start_date' doesn't mean the same thing
    # across registry families. SRUK/SRN-PPI both encode the registered
    # mitigation-action start date the same way. Verra's 'estimated project
    # start date' is a different concept (original crediting-period start,
    # sometimes years before a later SRUK re-registration) — confirmed on
    # real data (Katingan: SRUK start_date 2013, Verra estimated_start_date
    # 2010, same real project). Only trust an exact date mismatch as
    # conflicting evidence within the same clean-admin source family.
    if district_comparable and a.start_date and b.start_date and a.start_date != b.start_date:
        reasons.append(f"start_date differs: '{a.start_date}' vs '{b.start_date}'")
    return (len(reasons) > 0, reasons)


def match_score(a, b) -> tuple[float, dict]:
    """
    Returns (score 0-100, breakdown dict) comparing two UnifiedCandidateRecord
    objects. Does NOT mutate either record.
    """
    org_usable = a.org and b.org and not _is_generic_org(a.org) and not _is_generic_org(b.org)
    org_score = fuzz.token_sort_ratio(strip_legal(a.org), strip_legal(b.org)) if org_usable else None

    name_score = fuzz.token_sort_ratio(a.name or "", b.name or "")
    desc_score = fuzz.token_sort_ratio(a.description or "", b.description or "") if a.description and b.description else 0

    dates_match = (
        a.start_date is not None and a.start_date == b.start_date and
        a.end_date is not None and a.end_date == b.end_date
    )

    geo_usable = (
        a.latitude is not None and a.longitude is not None and
        b.latitude is not None and b.longitude is not None
    )
    geo_score = 0
    dist_km = None
    geo_suspect = False
    if geo_usable:
        dist_km = haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
        geo_score = 100 if dist_km < 1 else max(0, 100 - dist_km * 2)
        # Guard against bad source coordinates (confirmed real case: a sign
        # error in scraped Verra data placed a Seram project ~700km from its
        # true location, which would otherwise veto an obviously-true match).
        # If non-geo evidence is already strong but geo wildly disagrees,
        # don't let geo silently win — treat it as unusable and flag it,
        # rather than trusting a single coordinate pair over everything else.
        strong_non_geo = (org_score is not None and org_score >= 85) or desc_score >= 85
        if dist_km > 100 and strong_non_geo:
            geo_suspect = True
            geo_score = 0  # exclude from scoring, don't let it veto
            geo_usable = False

    # org_score of None means "not usable" (generic placeholder), not "0/no match" —
    # this distinction matters: a None must not be treated as a mismatch signal,
    # and its weight must be redistributed, not silently dropped, in BOTH the
    # geo-dominant and non-geo formulas below (confirmed necessary on real
    # data: dropping it un-redistributed in the geo branch alone cost a true
    # match ~15+ points for no real reason).
    org_weight_available = org_score is not None
    org_for_math = org_score if org_score is not None else 0

    province_a = PROVINCE_LOOKUP_ID_TO_EN.get((a.province or "").upper(), a.province)
    province_score = 100 if province_a and b.province and province_a.lower() == b.province.lower() else 0

    if geo_usable:
        if org_weight_available:
            total = 0.25 * org_for_math + 0.15 * name_score + 0.45 * geo_score + 0.15 * desc_score
        else:
            # redistribute org's 0.25 proportionally across name/geo/desc (weights 0.15:0.45:0.15)
            total = 0.20 * name_score + 0.60 * geo_score + 0.20 * desc_score
    else:
        # Two independent paths to a confident match when geo isn't usable
        # (either genuinely absent, or excluded as suspect above):
        #   Path A: name/org/province blend (the general case)
        #   Path B: org + description both near-verbatim
        # If org isn't usable (generic placeholder), redistribute its weight
        # onto name+description rather than silently scoring 0 for org.
        if org_weight_available:
            path_a = 0.30 * org_for_math + 0.20 * name_score + 0.30 * desc_score + 0.20 * province_score
            path_b = 0.5 * org_for_math + 0.5 * desc_score if (org_for_math >= 90 and desc_score >= 90) else 0
        else:
            path_a = 0.40 * name_score + 0.40 * desc_score + 0.20 * province_score
            path_b = 0.6 * desc_score if desc_score >= 90 else 0
        total = max(path_a, path_b)

    if dates_match:
        total = min(100, total + 10)

    conflict, conflict_reasons = has_conflicting_evidence(a, b)
    if conflict:
        total = min(total, 40 if len(conflict_reasons) >= 2 else 65)

    if geo_suspect:
        # We ourselves flagged the coordinate data as probably wrong — that's
        # an unresolved data-quality question, not evidence against a match.
        # Never let a self-flagged uncertainty result in silent rejection;
        # force at least "tentative" so a human actually sees it.
        total = max(total, 60)

    if name_score >= 88 and not conflict:
        # A near-verbatim, distinctive title (confirmed real case: "Central
        # Seram IFM Restorationwise" vs "...RestorationWISE") is strong
        # standalone evidence even when geo sits in the ambiguous 5-50km band
        # where distance alone can't distinguish "same project, different
        # survey precision" from "two different nearby projects" (confirmed
        # by the Kapuas Pisau/Kahayan pair, ~49km apart, genuinely distinct).
        # Floors to tentative, not auto-merge — still needs a human look.
        total = max(total, 60)

    breakdown = {
        "org_score": round(org_for_math, 1) if org_weight_available else "N/A (generic placeholder)",
        "name_score": round(name_score, 1),
        "desc_score": round(desc_score, 1),
        "dates_match_bonus": 10 if dates_match else 0,
        "geo_score": round(geo_score, 1),
        "geo_distance_km": round(dist_km, 3) if dist_km is not None else None,
        "geo_suspect_data_flagged": geo_suspect,
        "province_score": province_score,
        "conflict_detected": conflict,
        "conflict_reasons": conflict_reasons,
        "total": round(total, 1),
    }
    return total, breakdown


def classify_match(score: float) -> str:
    if score >= 85:
        return "auto_merged"
    if score >= 60:
        return "tentative"
    return "rejected"


def merge_records(primary, secondary, score: float, breakdown: dict):
    """
    Merges `secondary` into `primary` in place. `primary` is the higher-
    priority source (SRUK > SRN-PPI > Verra, per the priority rule already
    agreed) and wins on any field both sides provide. `secondary` only fills
    gaps and contributes its documents (unioned, not replaced) and DPP/DRAM
    track data if primary doesn't have it.
    """
    # fill gaps only — never overwrite a primary value that's already set
    for f in ("latitude", "longitude", "area_ha", "geometry", "verra_status",
              "verra_units", "dpp", "dram", "province", "district", "description"):
        if getattr(primary, f) is None and getattr(secondary, f) is not None:
            setattr(primary, f, getattr(secondary, f))

    for key, val in secondary.registry_ids.items():
        if val is not None and primary.registry_ids.get(key) is None:
            primary.registry_ids[key] = val

    # Same gap-filling merge as registry_ids just above, and for the same
    # reason: primary is picked by SOURCE_PRIORITY (sruk > srn_ppi > verra),
    # which has nothing to do with which side's URL is populated. Missing
    # this (as the initial version of this field did) silently drops a real
    # Verra registry URL on every multi-source-merged candidate where Verra
    # isn't primary — confirmed real on Katingan (SRUK-primary, 3-way
    # merged with a real Verra public_comment_period_url that vanished
    # until this loop was added).
    for key, val in secondary.registry_source_urls.items():
        if val is not None and primary.registry_source_urls.get(key) is None:
            primary.registry_source_urls[key] = val

    # documents: union, not replacement — this was the concrete, real lesson
    # from the Katingan case (SRN-PPI record had the valuable concession/SK
    # documents; SRUK record had the current status). Don't pick one.
    primary.documents.extend(secondary.documents)
    for src, count in secondary.documents_by_source_count.items():
        primary.documents_by_source_count[src] = count

    # contact — keep primary's if it has one, otherwise take secondary's
    if not primary.registrant_contact.name and secondary.registrant_contact.name:
        primary.registrant_contact = secondary.registrant_contact

    primary.field_sources.update(secondary.field_sources)
    primary.merged_from.append({
        "source": secondary.primary_source,
        "source_id": secondary.registry_ids.get(f"{secondary.primary_source}_registry_no")
                      or secondary.registry_ids.get("verra_project_id"),
        "match_score": round(score, 1),
        "match_status": classify_match(score),
        "breakdown": breakdown,
    })

    if primary.data_richness != "rich" and secondary.data_richness == "rich":
        primary.data_richness = "rich"
    if primary.verification_status == "unverified":
        primary.verification_status = "corroborated"

    return primary


SOURCE_PRIORITY = {"sruk": 3, "srn_ppi": 2, "verra": 1, "news": 0}


def resolve_candidates(records: list) -> list:
    """
    Given a flat list of UnifiedCandidateRecord objects from any mix of
    sources, pairwise-scores them and merges matches into single candidates.
    Records above the auto-merge threshold are combined; tentative matches
    are recorded as candidate_links, not merged; rejected pairs stay separate.

    Returns (final_candidates, tentative_links)
    """
    remaining = list(records)
    final = []
    tentative_links = []

    remaining.sort(key=lambda r: -SOURCE_PRIORITY.get(r.primary_source, 0))

    while remaining:
        primary = remaining.pop(0)
        merged_indices = []

        for i, other in enumerate(remaining):
            if provinces_conflict(primary, other):
                continue  # pre-filter: skip the expensive fuzzy comparison
                          # entirely when both provinces are known and differ
            score, breakdown = match_score(primary, other)
            status = classify_match(score)

            # Runs regardless of merge status — a sign-flipped coordinate
            # is wrong whether or not the pair ends up merged. Deliberately
            # scoped to breakdown["geo_suspect_data_flagged"] pairs only:
            # that flag already requires strong independent org/name/desc
            # evidence the two describe the same real thing (see
            # match_score()'s geo_suspect branch), which is what makes it
            # safe to null a coordinate here instead of just flagging
            # uncertainty — see detect_latitude_sign_flip()'s docstring
            # for the real Seram/SERCOVA (confirmed sign flip) vs
            # Tanimbar/Gunung Mas (confirmed NOT a sign flip, two real
            # distinct places) evidence this scoping is based on.
            if breakdown.get("geo_suspect_data_flagged"):
                flipped_side = detect_latitude_sign_flip(primary, other)
                if flipped_side is not None:
                    bad = primary if flipped_side == "a" else other
                    good = other if flipped_side == "a" else primary
                    bad.geo_flagged_reason = (
                        f"Latitude sign-flip detected against a cross-source match: negating this "
                        f"candidate's latitude ({bad.latitude}, {bad.longitude}) collapses its distance "
                        f"from {good.primary_source}'s '{good.name}' ({good.latitude}, {good.longitude}) "
                        f"from {haversine_km(bad.latitude, bad.longitude, good.latitude, good.longitude):.1f}km "
                        f"to real survey-precision range — treated as not yet available rather than trusted, "
                        f"same principle as an implausible single-source coordinate."
                    )
                    bad.latitude, bad.longitude = None, None

            if status == "auto_merged":
                merge_records(primary, other, score, breakdown)
                merged_indices.append(i)
            elif status == "tentative":
                tentative_links.append({
                    "candidate_a": primary.name, "candidate_a_source": primary.primary_source,
                    "candidate_b": other.name, "candidate_b_source": other.primary_source,
                    "score": round(score, 1), "breakdown": breakdown,
                    "match_status": "tentative",
                })

        for i in sorted(merged_indices, reverse=True):
            remaining.pop(i)

        final.append(primary)

    return final, tentative_links
