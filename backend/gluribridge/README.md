# GluriBridge

Indonesia forestry-carbon partner discovery pipeline for Gluri (I'm in Busan Impact Hackathon 2026).
Normalizes SRUK/SRN-PPI/Verra project data + BRWA customary-territory evidence + Tavily
news signals into one ranked, evidence-backed candidate list with generated dossiers.

**This README reflects the actual, tested state as of this handoff — not the plan, the state.**
Every claim below has a corresponding test file that was run and produced the stated result.

## Setup

```bash
pip install -r requirements.txt
```

## Running the tests

Run from the repo root (paths inside the test files are relative to it):

```bash
python3 test_run.py            # identity resolution: Katingan 3-way merge (SRUK+SRN-PPI+Verra)
python3 test_hardening_2.py    # identity resolution stress tests: Seram collision, Kalimantan proximity cluster
python3 test_brwa.py           # BRWA spatial evidence, single territory
python3 test_brwa_2.py         # BRWA at real scale: 2283-territory list, policy tier classification
python3 test_news_matching.py  # Tavily hit decision logic (mocked — see LIVE API caveat below)
python3 test_contact_tier_b.py # Tier B contact resolution, including the adversarial content-check case
python3 test_scoring.py        # need vs. credibility scoring, two-axis ranking
python3 test_dossier.py        # dossier generation, 3 contrasting real profiles
python3 test_outreach.py       # outreach email generation, 5 contrasting real profiles
python3 test_citations.py      # citation linking, 4 contrasting real cases + full-128 sweep
python3 test_compliance.py     # compliance.py's rules-file path + real non-default badge on real data (guards the 2026-08-27 reorg bug's exact failure mode)
python3 test_pipeline.py       # full pipeline, BRWA-only variant
python3 test_full_pipeline.py  # full pipeline: normalize -> resolve -> BRWA -> news -> Tier B -> score -> dossier
python3 test_export.py         # frontend-shaped JSON export (writes to exported_output/)
```

All of these were run and passed immediately before this handoff. If any fail on your machine,
that's a real regression worth investigating, not an expected flake.

## What's built and tested against real data

| Module | Does | Confidence |
|---|---|---|
| `schema.py` | `UnifiedCandidateRecord` — same 40-ish field shape for every source | High |
| `normalize_sruk.py` | SRUK + SRN-PPI -> unified record, 2 known schema variants handled. `KNOWN_PLACEHOLDER_COORDS` correctly nulls a national-centroid placeholder (`-2.4, 118.8271`) instead of trusting it as real geometry — confirmed (2026-08-31) this fires on **42 of 92 (46%)** real raw SRUK files, not a rare edge case; explains a meaningful share of the map's "no coordinates" candidates (e.g. every Jawa Barat/Jawa Tengah candidate) — see PROJECT_CONTEXT.md Section 7 | High |
| `normalize_verra.py` | Verra -> unified record | High |
| `normalize_brwa.py` | BRWA territory + policy-tier classification, bulk loader | High on classification (2283 profiles); geometry coverage in the real production crawl is 1,756 of 2,283 (~77%) as of 2026-08-26 — up from 72/2283 (~3%) at initial handoff, confirmed by a targeted re-crawl that the remaining ~23% genuinely have no embedded geometry on BRWA's own site, not a crawl gap. The `sample_data/` fixtures bundled with this package still ship the original 72/2283 snapshot on purpose — see Sample Data section |
| `match.py` | Identity resolution: fuzzy + geo + description, conflict detection | High — multiple distinct real bug classes found via actual adversarial test data, not hypothetically, including a missing province pre-filter that was letting cross-province pairs flood the tentative-review queue (cut from 2,872 down through several further fixes — a translation-gap bug in that same filter, then a raw-record dedup fix — to the current real **84** tentative links, verified directly against the live export, not this figure alone), and a real case where a perfect org+name match still lands in the tentative band because geo/desc weighting drags the total down — see PROJECT_CONTEXT.md Section 6 for the complete, current list |
| `news_matching.py` | Tavily query building, corroborate/new/discard decision | Logic tested against mocks originally; **the live API has since actually run**, multiple times this session (smoke test, staged batches, and full production runs) — most recently 146 real queries, 640 real hits processed, 528 discarded / 100 corroborated / 12 promoted to new thin candidates |
| `tavily_client.py` | API wrapper, schema verified against Tavily's current docs | **Executed live and confirmed correct** — the real response schema matched what this was written against on the first try, no client changes needed |
| `contact_resolution.py` | Tier B: org-website contact lookup, content-based self-identification gate | Tested including adversarial cases found via mocks originally; live Tavily runs this session surfaced and fixed two further real false-positive causes (an unrelated-page self-referential-language false hit, a domain-unrelated placeholder email) — see PROJECT_CONTEXT.md Section 6 |
| `compliance.py` | 4 of 25 encoded Permenhut rules wired: R003 (Pasal 6(1), Pelaku Usaha category), R006 (Pasal 10, Unit Karbon precondition), R016 (Pasal 61, deadline badge), R022 (Pasal 20, DPP-track precondition) | Tested against real candidates; **no `red` case exists for R016 in any real test** since today's date is before the 13 Oct 2026 deadline |
| `scoring.py` | Two-axis scoring: need_score + credibility_score, split deliberately (see below) | Tested against all real candidates across every profile shape encountered |
| `dossier.py` | Template-based (no LLM) one-page dossier per candidate | Tested against 3 contrasting real profiles; found and fixed a real bug (thin candidates showing a misleading "no gaps" message) |
| `pipeline.py` | One orchestrating function: normalize -> resolve -> BRWA -> news -> Tier B -> score -> dossier. Also carries `preserve_contacts_by_registry_key` (2026-08-31, additive, default `None`) — restores a prior run's Tier B/manual contact for a candidate a registry-only rerun resolves none of its own, keyed on `registry_ids`, NOT `candidate_id` (see Known Bugs below for why) | Tested end-to-end, reproduces every individual module's output exactly; the new param verified via a full simulated registry-only reseed against real raw data, not just unit tests |
| `export.py` | Frontend-shaped JSON (`ranked_candidates.json`, `candidate_details.json`, etc.) | Tested; caught one real bug (Verra epoch-ms date field) |
| `outreach.py` | English-only v1 outreach email generation, template-based/no-LLM (see `dossier.py`'s design philosophy) | Tested against 5 contrasting real profiles (Tier A, Tier B, no-contact thin, Katingan, mixed fact+hypothesis reasons) |
| `citations.py` | Resolves a real, checkable source for every need/credibility reason — document URL, BRWA decree, news article, or an honest no-document note; never a fabricated link | Tested against 4 contrasting real cases + a full-128-candidate sweep in an actual browser (not just JSON) — 0 broken links, 0 empty notes |
| `activity_type.py` | Real activity-type classification — 5 real categories (Peatland, Reforestation, Social forestry, Conservation, Improved Forest Management), multi-tag, plus a structural (not keyword-guessed) "not applicable" detector keyed on Verra's own `afolu_activities` field | Built only after a real classification test against 43 real titles confirmed the real hit rate cleared the mentor's own stated threshold — see PROJECT_CONTEXT.md Section 7 for the full test, the widened-keyword re-test, and the final live 144-candidate numbers (95 classified / 48 Unclassified / 1 Not applicable). `test_activity_type.py` covers all 12 real cases including the AgriCapture Not-applicable case and the IFM field-based signal |

## Why need_score and credibility_score are separate, not one number

A mature, fully-documented project (e.g. Katingan, confirmed across 3 registries) will score
`need=0` — not because it's a bad candidate, but because there's no detected documentation gap
for Gluri to fill. A brand-new DRAFT submission missing its DRAM will score high on `need` and
lower on `credibility`. Blending these into one number hides which situation you're looking at.
Sort by either axis depending on what you're trying to find.

## Known bugs found and fixed during development (for context, not action items)

- Boilerplate-description false positive in identity resolution (two genuinely different SRUK
  projects by the same org, same template text, wrongly auto-merged until a conflict veto was added)
- Sign-flipped latitude in a real Verra scrape (+3.09 instead of -3.09 for a Seram-island
  project) — originally fixed only at the matching layer (`geo_suspect`, stopped it from vetoing
  the real SRUK/Verra match); the coordinate itself kept feeding the map/scoring/BRWA checks
  until a user spotted the resulting ocean pin. Now actually corrected at the source too — see
  PROJECT_CONTEXT.md Section 6's connecting entry for the full story and the real lesson
  (fixing a symptom where you found it ≠ the underlying data got fixed everywhere it's used).
- "Multiple Project Proponents" generic placeholder being scored as a real org mismatch
- BRWA province name mismatch: SRUK uses Indonesian names, Verra uses English — silently zero
  matches without translation (fixed, but the translation table is incomplete — see Open Items)
- Org-name extraction from news headlines grabbing trailing headline verbs ("...Reports Progress")
- Verra `registration_date` field arriving as raw Unix epoch-ms instead of an ISO date string
- Dossier's zero-need fallback message reading as false confidence for unverified thin candidates
- **Contact-resolution export drift (2026-08-30/31), found by a full health-check sweep, not a
  targeted fix.** `orchestrate.py`'s `run_normalization_and_export()` never passes a
  `tavily_client` to `run_pipeline()`, so a registry-only run (the normal unattended
  `scheduler.py` hourly cadence) rebuilds every candidate from raw data alone and silently drops
  any Tier B (`org_website`) or human-reviewed (`manual_review`) contact a prior richer run had
  found — those aren't derivable from raw registry data at all. Fixed with
  `pipeline.py`'s new `preserve_contacts_by_registry_key` (see module table above). **Important:
  the first draft of this fix keyed the preserved-contacts dict on `candidate_id` and would have
  silently done nothing in production** — caught only by testing an actual simulated registry-
  only reseed, not by trusting that all 14 existing tests still passed (none of them exercise
  this param). `candidate_id` is a fresh `uuid.uuid4()` on every `run_pipeline()` invocation, not
  a stable identifier across runs — confirmed empirically (same real record, two different
  `candidate_id`s across two runs on identical raw input) and now documented directly on the
  field itself in `schema.py`, and as its own design-principle entry in PROJECT_CONTEXT.md Section
  5, not just here. Re-keyed on `registry_ids` (e.g. `verra_project_id`), which IS stable across
  runs. Full story, including a second bug caught in the same draft (a `RegistrantContact`
  `is not None` guard wrongly treating Verra's always-non-`None`-but-empty contact object as
  "already resolved"), in PROJECT_CONTEXT.md Section 6.

## Open items — genuinely not done, not just "could be nicer"

1. ~~Live Tavily API call has never executed.~~ **Resolved.** The live API has now run
   multiple times this session — a smoke test, a controlled 3-province batch, then full
   production runs across all real provinces (news matching + Tier B contact resolution
   together). The real response schema matched `tavily_client.py`/`news_matching.py`'s
   assumptions on the first try, no client changes needed. Most recent full run: 146 real
   queries, 640 real hits processed (528 discarded, 100 corroborated, 12 promoted to new thin
   candidates), 57 Tier B contact attempts, 3 resolved, 0 errors. Real Tavily results are
   confirmed non-deterministic run-to-run on identical queries — expect small evidence-count
   drift between runs, not a bug.
2. **Tier C contact resolution (extracting a named contact from news-article prose) —
   deliberately not pursued, not an oversight.** Only Tier A (SRUK/SRN-PPI registrant) and
   Tier B (org website) are built. Reasoning: Tier B, the structurally easier of the two
   remaining tiers, required four separate hardening rounds this session before it was
   trustworthy enough to resolve just 1 of 128 real candidates — Tier C has no equivalent
   structural anchor to verify against (no copyright footer, no dedicated contact page), making
   a false positive harder to catch than anything Tier B faced. The 44 of 128 real candidates
   currently landing in `insufficient_contact` are not a gap to close before Demo Day — that's
   the accurate, honest answer for them, same principle as everything else in this pipeline.
   Full reasoning: PROJECT_CONTEXT.md Section 7. Revisit only if post-Demo-Day priorities
   specifically call for it.
3. **`PROVINCE_LOOKUP_ID_TO_EN` in `normalize_sruk.py` still has only 3 entries** (Kalimantan
   Tengah, Jawa Barat, Riau) — unchanged this session, confirmed by direct check. Two distinct
   consequences, of different severity:
   - Original one: every Verra candidate outside those 3 provinces gets no BRWA province
     pre-filter and falls back to checking against every loaded territory directly — works,
     just slower, not a correctness issue.
   - **Found and fixed same-day**: `match.py`'s `provinces_conflict()` (added this session to
     fix cross-province tentative-link flooding) reused this same 3-entry table. For any
     province outside the 3, a genuinely-matching same-real-province SRUK/Verra pair (e.g.
     "JAWA TENGAH" vs "Central Java") compared raw, untranslated strings — always unequal — so
     `provinces_conflict()` returned a false conflict and `resolve_candidates()` skipped
     `match_score()` entirely, worse than `tentative` (invisible, never reaching
     `tentative_links.json` at all). Quantified on the real 128-candidate pool: 3,671 pairs hit
     this translation-gap path; only 21 were a genuine same-province false positive (checked
     against an independent reference table), and none of those 21 shared a matching org name —
     no real duplicate was actually being hidden. Fixed by requiring translation to have
     genuinely succeeded on both sides before reporting a conflict (falls through to "unknown"
     otherwise) — see PROJECT_CONTEXT.md Section 6 for the full writeup. **The fix's effective
     scope is intentionally kept broad, not narrowed back down to just the 21-pair case**: it
     also disables this pre-filter for most SRUK-vs-Verra comparisons generally, since Verra's
     province is almost never spelled the Indonesian way — a deliberate choice, since the
     pre-filter was never reliably confirming anything for cross-source pairs to begin with (only
     21 real false positives out of 3,671 gap-path calls). Measured before/after:
     `tentative_link_count` 82 → 155, `final_candidate_count` unchanged at 128 (zero new
     auto-merges). One of the new tentative pairs is a genuine catch that settles the decision to
     keep the fix broad: the same real org ("Asia Assets Developments Co. Ltd. (PP)") appears
     under two genuinely different real provinces — narrowing the fix back down would make that
     specific pair invisible again.
4. ~~BRWA geometry coverage is 72 of 2283 real territories (~3%).~~ **Updated, not resolved —
   ceiling reached, not 100%.** A targeted re-crawl (2026-08-26) of the real production data
   brought coverage to **1,756 of 2,283 (~77%)**. The remaining ~527 were specifically checked,
   not just left unfetched — they genuinely have no embedded geometry on BRWA's own site, so 77%
   is the real ceiling for this data source, not an in-progress number. The list-level
   policy-tier classification still covers all 2,283 either way (a separate, cheaper thing).
   `pipeline.py`'s `brwa_coverage_gaps` output tells you exactly which nearby territories are
   missing per candidate — check that before assuming a `land_rights: none found` result is a
   true negative. (The `sample_data/` fixtures bundled with this package intentionally still
   ship the original 72/2283 snapshot — see Sample Data section below, don't confuse the two.)
5. ~~Only 1 of 25 encoded Permenhut rules (R016, Pasal 61) is wired into scoring.~~ **Now 4 of
   25**: R003 (Pasal 6(1), Pelaku Usaha category eligibility), R006 (Pasal 10, Unit Karbon
   trading precondition), R016 (Pasal 61, deadline badge — the original), and R022 (Pasal 20,
   the DPP-track/Verra-side equivalent of R006's precondition). The other 21 rules are flagged
   in `compliance.py`'s `NOT_WIRED_REASONS` dict with a specific, individual reason each (most
   are ministry-internal procedures or need a normalized field `UnifiedCandidateRecord` doesn't
   have) — not a blanket "not done yet."
6. ~~No outreach email generation.~~ **English-only v1 built** (`outreach.py`), same
   template-based/no-LLM philosophy as `dossier.py`, wired into `export.py`'s `detail_view()` as
   a new `outreach` field. Distinguishes three real contact shapes explicitly rather than
   "has contact / doesn't" — confirmed on the real 128 registry candidates, not assumed: every
   Tier A contact (83 of 128) has a real name and `email=None`; every Tier B contact (1 of 128)
   has a real email and `name=None`. (An earlier "5 of 128" figure floated during the initial
   build counted Tier B resolutions across all final candidates including thin/news-derived
   ones — restricted to the 128 real registry candidates specifically, as everywhere else in
   this doc, it's 1.) `name_only_no_email` generates the full email addressed by
   name but flags "needs manual lookup" rather than presenting it as ready-to-send;
   `email_only_no_name` generates with a generic organization salutation and the real address;
   `insufficient_contact` (44 of the 128 real registry candidates, not just thin ones) refuses
   to generate at all, same honesty pattern as `dossier.py`'s thin-candidate `suggested_poc`
   text. Fact-tagged `why_gluri`
   reasons are stated plainly in the opening paragraph; a hypothesis-tagged reason is hedged
   ("Based on what we've found so far, it appears that...") in the same sentence-by-sentence
   pass — verified directly with a mixed fact+hypothesis case, not just at the whole-email
   level. ~~Still open: bilingual (ID/EN) generation.~~ **Now built**: every generated email
   carries both languages by default (English first, then Indonesian below a labeled divider —
   `subject_en`/`subject_id`/`body_en`/`body_id` also exposed individually). Scope boundary,
   stated explicitly rather than silently narrowed: only the FIXED strings (salutation, subject,
   company intro, sign-off, the fact/hypothesis hedging wrapper — `"tampaknya"`, matched for
   hedging weight, not a literal dictionary swap) have real Indonesian twins. The DYNAMIC content
   (why_gluri reason text, suggested_poc, next_questions) comes from `dossier.py`, which has no
   Indonesian output anywhere in the system, so it stays English inside both language sections —
   giving `dossier.py` itself real Indonesian dynamic content would be a natural, larger
   follow-up, not done here. The Indonesian hedge ("Berdasarkan temuan kami sejauh ini,
   tampaknya...") is pinned down with the same kind of explicit assertion as the English one,
   not eyeballed.
7. **No FastAPI service, no database, still true.** Everything here is a Python function called
   from a test script; `export.py` writes flat JSON files once, on demand. **Partially
   addressed**: `orchestrate.py` (repo root, above this package) is now a thin scheduler-like
   layer with a real per-source cadence table (SRUK/Verra daily, SRN-PPI monthly, BRWA manual)
   and a `data/.freeze` mechanism to hold data stable across a demo window — this is a designed
   product capability now, just invoked manually rather than by an actual cron/service. No
   database still means no persistence between runs beyond the flat JSON files themselves.
8. **No real frontend.** One static HTML mockup was shown once in conversation, built from real
   exported data but never turned into an actual app.
9. **The org-extraction regex (`news_matching.py`) and the self-identification content checks
   (`contact_resolution.py`) are both keyword/pattern-based** — this prediction already came
   true this session: once real Tavily data actually flowed through, it surfaced concrete new
   edge cases (a fuzzy org-name-shape collision between two unrelated real foundations sharing a
   naming template; a US government page's own "Contact Us" boilerplate resolving to the wrong
   org; a certification body's announcement page passing via a narrative title; an unfilled
   website-template email; a short-org-slug acronym collision), all found and fixed — see
   PROJECT_CONTEXT.md Section 6. One is deliberately left as a permanent residual limitation
   (a genuine substring collision between two differently-named real companies, "PT Carbon" vs
   "Carbon Creek PT" — not a looseness in the check). Still keyword/pattern-based, still not
   proven against arbitrary new phrasing beyond what's been seen — expect more edge cases as
   more real data flows through, same as before.
10. **`news_actions` (the per-hit discard/corroborate/new_thin_candidate log `pipeline.py` builds
    while processing news hits) exists only in memory during a `run_pipeline()` call and isn't
    persisted anywhere by `export_pipeline_result()`.** The aggregate counts (`news_hits_processed`,
    `news_corroborations`, `news_thin_candidates_created` in `pipeline_stats.json`) are enough for
    today's reporting, and the discard count is exactly derivable from them (hits − corroborations
    − new thin candidates, since every hit maps to exactly one of the three). But if anyone ever
    needs to audit *why* one specific hit was discarded or corroborated rather than just how many
    were, that data doesn't survive past the process that produced it — same shape of gap as the
    province-translation table above, not urgent, just don't want it lost.
11. **Product idea, not a bug — surfaced while investigating the raw-record dedup fix above,
    worth remembering independent of it.** At least one real organization's SRUK submission
    (program_code `REG-11-PR-XII-2025-4278`) had its `responsible.name` (the registered
    responsible-party org) genuinely changed between two scrapes of the identical submission
    (same internal registry id) — from "Thryve earth" to "KOPERASI MULTIPIHAK RESTORASI
    LANSKAP HUTAN SULAWESI". Nothing today detects or flags this; the pipeline just picks
    whichever raw copy survives normalization. A compliance-minded tool arguably should be able
    to flag a responsible-party change on an existing registration as its own signal (ownership
    change, re-assignment, or a data-entry correction — worth distinguishing, not silently
    absorbing) rather than only noticing it by accident during an unrelated dedup investigation.
    Nothing designed or built yet; flagging the idea before it's lost.
12. ~~No test anywhere in `backend/tests/` exercises `compliance.py`'s output.~~ **Resolved
    same day.** This was exactly why the reorg's silent path bug (PROJECT_CONTEXT.md Section 6
    — `DEFAULT_RULES_PATH` broke closed, every candidate's compliance evaluation silently
    landing on `not_applicable` with the real cause buried in a `reason` string) survived the
    entire post-reorg period undetected behind a fully green 13/13 test suite. Fixing the path
    bug itself only fixed that one instance, not the gap that let it hide — so
    `backend/tests/test_compliance.py` was added: asserts the rules file exists at the exact
    path the module will use (not just that *some* file loaded), that at least one real
    candidate gets a non-default R016 badge on real data (an all-`not_applicable` result is
    treated as a bug signal, not a plausible real outcome), and that no candidate's `reason`
    string contains the file-load-failure text. Confirmed the test genuinely catches this bug
    class, not just in theory: pointing `GLURIBRIDGE_REGULATORY_RULES_PATH` at a nonexistent
    file makes it fail immediately with a clear assertion message. All 14 tests (13 prior + this
    one) pass together.
13. **Candidate detail page has a real per-candidate territory map (2026-08-27).** ~~A
    dashboard-level version is a deliberately separate, deferred decision, not built here.~~
    **Built same session (2026-08-28), as part of the Dashboard rebuild.** The per-candidate map
    (candidate point + real BRWA polygon when a `brwa_overlap` exists, an honest "No location
    data on file" message when it doesn't) still lives inside the Land Rights panel on the
    candidate detail page, unchanged. The dashboard-level version (`DashboardMap.tsx`) reuses the
    exact same tile layer, marker color convention, and `GET /territories/{idx}/geometry`
    endpoint — not a second map implementation. It plots every real candidate marker (144) at
    once, but deliberately still does NOT load every real BRWA polygon — only the real, bounded
    set with a *confirmed* overlap (11 of 144 candidates, ~10 distinct territories), each fetched
    and counted individually, same honest-gap handling as everywhere else (a 404'd geometry is
    excluded from the on-screen count, not silently assumed present). Loading all 1,756
    geometry-bearing territories regardless of relevance remains out of scope, for the same
    rendering-cost reason originally flagged here. Territory Discovery (rebuilt 2026-08-28) adds
    a second, separate whole-map view with its own candidate filter panel (province/need/
    credibility/richness/BRWA overlap) — distinct from this dashboard map, which has no filter.
14. ~~A real, upstream implausible-latitude case found via this session's territory-map sanity
    sweep — Verra project 5620, not fixed at time of discovery.~~ **Resolved same day.** Verra
    project 5620 ("Carbon Agroforestry in Cimanuk, Progo and Brantas Watershed"), single-source
    (Verra only, no SRUK/SRN-PPI side to cross-check against), carried
    `latitude=7.0909, longitude=107.6689` — the South China Sea, off southern Vietnam — traced
    directly to Verra's own raw scrape, not introduced anywhere in this pipeline. Same SIGN-FLIP
    shape as the already-documented Verra "+3.09 instead of -3.09" case (PROJECT_CONTEXT.md
    Section 6), a different record, and — because this candidate has only one source — outside
    the reach of that earlier fix, which only runs during `match.py`'s CROSS-SOURCE geo
    comparison. Now a third confirmed instance of the same failure mode via a third, unrelated
    discovery route (full writeup, including why this is now treated as a standing risk category
    rather than a one-off, in PROJECT_CONTEXT.md Section 6). Fixed with
    `match.py`'s `flag_implausible_single_source_geo()`: a single-source Verra candidate whose
    point falls outside a generous Indonesia bounding box gets its coordinate nulled back out
    and a specific, citable `geo_flagged_reason` recorded — surfaced in `detail_view()`'s
    `location` block, distinct from a candidate that genuinely never had a coordinate. Verified
    real, not assumed: 5620's `credibility_score` dropped from a falsely-confident 47.1 to an
    honest 35.3 (Geospatial 10/20→0/20, Land rights' reason text changed from "No BRWA overlap
    found" — implying a real check — to "not yet available... never checked"); re-ran the
    bounding-box check against all 84 candidates with no coordinate at all first, specifically
    to rule out a fourth hiding instance, before writing the fix — confirmed nothing to check
    there (a null value can't be outside a box); full re-sweep after the fix shows 0 of 59
    remaining coordinates outside the box. All 14 tests still pass.
15. **Dashboard's province breakdown panel (2026-08-28) is deliberately not filter-linked, unlike
    every other Dashboard summary number.** The 4 KPI cards and all 5 executive-summary sentence
    figures link through to a real filtered Candidates view, reusing the exact same field/threshold
    the number counts. The province panel doesn't, because its rows are a *normalized derived
    category* (`frontend-react/src/lib/provinceNormalize.ts` — collapsing real but inconsistent raw
    strings like "Central Kalimantan" / "KALIMANTAN TENGAH" / "Central Kalimantan " with a trailing
    space into one canonical label), not a raw backend field the shared filter library
    (`candidateFilter.ts`) can already express. Making it clickable would mean either extending
    `CandidateFilterParams` with a province-category filter or duplicating the normalization logic
    in a second place — real, buildable, just not done this round since it wasn't asked for.
16. **Korean localization scoped (2026-08-28), not built.** The frontend has zero i18n
    infrastructure — no library, no locale files, no `t()`/message-key abstraction; every one of
    the ~24 page/component files authors its UI text as inline JSX string literals. Estimated at
    roughly 2-3 dev-days to make the UI chrome (labels, buttons, headers, nav, table columns)
    swappable — mechanical but real work touching every file, since almost none of it is
    centralized today (a few enum→label lookup tables, e.g. `ScoreLabelPill`'s `SCORE_LABEL_TEXT`
    and `StatusBadge`'s `STATUS_LABEL`, are already single-source-of-truth and would need only
    their values swapped). The genuinely hard part isn't the labels: the Dashboard's and Territory
    Discovery's templated executive-summary sentences (numbers interpolated mid-English-sentence)
    carry the same hedge/word-order risk that required a dedicated hardening effort for bilingual
    outreach email generation (`outreach.py`'s ID/EN pair, this doc's item 6) — Korean word order
    doesn't map onto the same template positions, so these need real ICU-style message templates,
    not simple key-swaps. Real candidate/organization/evidence data (from `dossier.py`/`scoring.py`)
    stays untranslated regardless of scope — paraphrasing real evidentiary text into Korean would
    violate this project's no-lossy-translation discipline; only UI chrome is in scope for any
    future pass. Deferred pending confirmation the need is real, not assumed: the actual question
    to resolve first is whether the CEO genuinely cannot review English dossier/summary text, not
    whether a Korean UI would be nicer to have.

## Sample data included in this package

- `sample_data/sruk/` — 6 real SRUK/SRN-PPI records (Katingan pair, 3 Seram companies, 1 VER-prefix record)
- `sample_data/uploads/` — real Verra scraper output (13 projects), 2 more SRUK records, 2 BRWA
  profile+geojson pairs, the full 2283-row BRWA list (`wa_list.json`)
- `sample_data/brwa_bulk/profiles/` — all 2283 real BRWA territory profiles
- `sample_data/brwa_bulk/geojson/` — 72 real BRWA territory geometries. This is a **frozen
  snapshot from initial handoff**, deliberately kept as-is as a stable test fixture — it does
  NOT reflect the real production coverage, which is now 1,756 of 2,283 (~77%, see Open Items
  #4) after this session's targeted re-crawl into `data/raw/brwa_geojson/`. Don't read "72" here
  as the current real number; it's what this package's test fixtures ship with, on purpose.

None of this is synthetic. Every number in every test file's expected output was checked against
these actual files, not invented.
