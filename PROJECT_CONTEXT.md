# GluriBridge — Project Context

Read this fully before touching any code. This is the entire "why" behind decisions that
otherwise look arbitrary in the code itself.

## 1. What this is, in one paragraph

Gluri is a Busan-based startup (2 people) with a satellite+AI forest-carbon dMRV product
(`treXchange`). They're preparing an Indonesia PoC but told us directly: they can't tell, from
outside Indonesia, which organizations actually need their technology, who to contact, or
whether a real point of collaboration exists. GluriBridge is a pipeline that pulls every
forestry-carbon-relevant project/organization from Indonesia's official registries (SRUK,
SRN-PPI, Verra), cross-references land-rights evidence (BRWA), scores each on whether it
plausibly needs Gluri's tech, resolves a real contact, and generates a one-page dossier —
so Gluri gets a ranked, evidence-backed shortlist instead of a directory.

This is for **"I'm in Busan" Impact Hackathon 2026** (organizer: UD Impact). Demo Day is
**5 September 2026**. Program structure: Diagnose → Analyze → Design → Build.

## 2. The actual problem, in the client's own words

Organizer's one-line framing for Gluri (Theme 2, Forestry & Ocean ESG):

> "We measure and verify forest carbon with satellites and AI, but abroad we can't check the
> rules, pilot conditions, or find local partners."

Gluri's own answers when we asked them directly (this is the actual spec, not our
interpretation):

- They have **no existing candidate list, no trusted starting source, no fixed target
  region/org-type**. Their own manual process would be: search news/campaigns, cold-email
  public contacts. That's exactly what the `news_matching.py` module automates.
- **The hardest part isn't finding candidates — it's judging whether a real point of
  collaboration exists**, whether the counterpart needs their tech, and who to contact.
- A useful shortlist needs, per candidate: name, location, reason recommended, contact point,
  required permits, next questions — **plus an explicit label distinguishing a confirmed fact
  from an inferred hypothesis.** This single sentence is why every rule in this codebase tags
  its output `evidence_level: "fact"` or `"hypothesis"` — it's a direct requirement, not a
  design preference.
- Country scope: Indonesia is the priority but not exclusive — India/Nepal (their team's home
  countries) are admissible if genuinely stronger. (Not built yet — see Open Items.)

Organizer's own diagnosis of what's hard, which shaped several specific design decisions:

> "부지 권한·수요'처럼 겉으로 안 보이는 조건 판별이 핵심 난이도" — judging hidden conditions
> like land rights and demand is the core difficulty.

This is specifically why BRWA (land-rights evidence) exists in this pipeline at all, and why
it's treated as spatial evidence attached to a candidate rather than another registry to
identity-match against — a customary territory isn't a "project," it's a fact about a place.

## 3. Domain glossary — Indonesian regulatory terms used throughout the code

| Term | Meaning |
|---|---|
| SRUK | Sistem Registri Unit Karbon — Indonesia's carbon-**unit** registry (launched 9 Jul 2026). Registers the tradable credit, only after validation/verification. |
| SRN-PPI | Sistem Registri Nasional Pengendalian Perubahan Iklim — the older, broader climate-**action** registry (since ~2017/2021). Registers the mitigation action itself, regardless of whether it becomes a tradable credit. Confirmed via real data: SRUK and SRN-PPI can hold the SAME real project under completely different registry numbers, disambiguated by registrant username prefix (`sruk_...` vs `srn.*`). |
| DRAM | Dokumen Rancangan Aksi Mitigasi — the domestic-track project design document, required for SPE GRK (Permenhut Pasal 11-14). |
| DPP | Dokumen Perencanaan Proyek — the international-standard-track equivalent of DRAM (Permenhut Pasal 20-23), used by Verra-track projects. **A candidate having DPP but not DRAM is NOT a documentation gap** — they're on the international track instead of the domestic one. This distinction broke our need-detection logic once already; don't reintroduce the bug. |
| SPE GRK | Sertifikat Pengurangan Emisi GRK — the actual emission-reduction certificate, domestic track. |
| PBPH | Perizinan Berusaha Pemanfaatan Hutan — a forest-utilization business license, one of 5 legal categories of `Pelaku Usaha` (Permenhut Pasal 6(1)) who can trade forest carbon. |
| BRWA | Badan Registrasi Wilayah Adat — Indonesia's customary/indigenous territory registry (NGO-run, 2283 territories total). Two independent axes per territory: `policy_tier` (`penetapan` = a specific government determination, strongest; `pengaturan` = general regional regulation, weaker; `belum_ada` = no policy doc) and `verification_maturity` (`early`/`mid`/`advanced`, BRWA's own internal process). **`policy_tier` comes from BRWA's own list-level classification (`wa_list.json`), not from guessing at document text** — this replaced an earlier regex-based approach that got the tier wrong on real data. |
| Permenhut 6/2026 | The regulation governing forest-carbon trading. Pasal 61 (rule `R016` in our encoded table) is a transitional provision: projects registered before 13 Apr 2026 that reached a technical stage must report to the Ministry by 13 Oct 2026. The real rules table has **25** entries (not 24, an earlier miscount) — **4 are wired into scoring** (R016/Pasal 61, R006/Pasal 10, R003/Pasal 6(1), R022/Pasal 20), the other 21 are each flagged with a specific reason they aren't evaluable against fields `UnifiedCandidateRecord` has, not silently skipped (see `compliance.py`'s `NOT_WIRED_REASONS`). |

## 4. Architecture — what actually happens, in order

```
SRUK/SRN-PPI scrapers ─┐
Verra scraper          ─┼─▶ per-source normalizer ─▶ UNIFIED CANDIDATE RECORD ◀── identity resolution
BRWA list + geometry    ┘         (same schema             (fuzzy org/name/desc/geo match,
Tavily news search ──▶ discovery    for every source)        conflict detection, NOT a simple
                       signal only                            "first match wins")
                          │
                          ▼
              attach BRWA evidence (spatial, not identity — a customary
              territory is a fact about a PLACE, never its own candidate)
                          │
                          ▼
              score: need_score (gap/opportunity) + credibility_score
              (maturity/confirmation) — DELIBERATELY SEPARATE, not blended.
              A mature, fully-documented project scores need=0 correctly —
              that means "no gap detected," not "bad candidate."
                          │
                          ▼
              dossier generation (deterministic template, NO LLM — every
              sentence traces to a specific field/rule, nothing invented)
                          │
                          ▼
              export as frontend-ready JSON (ranked list + full detail
              per candidate, including the full evidence/merge trail)
```

All of this is one function call: `gluribridge.pipeline.run_pipeline(...)`.

## 5. Design principles — the "why" behind things that look like extra complexity

- **Fact vs. hypothesis, everywhere.** Every rule that contributes to a score tags itself
  `evidence_level: "fact"` or `"hypothesis"`. This is a direct requirement from Gluri's own
  answer, not an aesthetic choice — don't collapse it into a plain sentence anywhere.
- **No LLM for scoring or normalization.** Deterministic, auditable, reproducible, cheap to
  re-run daily. The LLM's only legitimate role in this pipeline is turning already-computed
  facts into readable prose (dossier polish) or extracting entities from genuinely unstructured
  text (news headlines) — never deciding a score or a match.
- **A blocklist can never be complete — prefer content-based verification over string matching
  where possible.** Learned the hard way: `contact_resolution.py`'s Tier B originally trusted a
  domain-name fuzzy match; an adversarial test (an unlisted news domain that coincidentally
  matched an org's name and had an unrelated email on the page) proved that wrong. The fix
  was checking page CONTENT for self-identification (copyright footer, first-person language)
  rather than trusting the domain string. Apply this instinct to future heuristics.
- **A thin/unverified candidate must never look equivalent to a confirmed one.** `data_richness`
  ('rich'/'corroborated'/'thin') is tracked on every candidate and must stay visible in any
  UI/export — never silently blended away.
- **When a check can't run, say so — don't default to a negative result.** E.g. BRWA land-rights
  evidence: if a candidate has no coordinates, the correct output is "not yet checked," not "no
  overlap found." `compliance.py`'s `not_applicable` badge follows the same principle.
- **`candidate_id` is NOT a stable identifier across separate pipeline runs — never key
  cross-run state on it.** `schema.py` assigns a fresh `uuid.uuid4()` to every
  `UnifiedCandidateRecord` on construction, and nothing downstream makes it deterministic; the
  exact same real record gets a different `candidate_id` on every `run_pipeline()` rerun, even on
  byte-identical raw input. Anything that needs to recognize "the same real candidate" across two
  separate runs — persisted contact resolution, tracked/partnership status, notes, bookmarked
  URLs — must key on `registry_ids` instead (e.g. `verra_project_id`, `sruk_registry_no`), which
  comes straight from the raw registry file and genuinely is stable. Found the hard way: see
  Section 6's contact-resolution export-drift entry, where a first draft of that exact fix was
  keyed on `candidate_id` and would have silently matched nothing in production.

## 6. Known real bugs already found and fixed (context for why certain code looks defensive)

- Two genuinely different SRUK projects by the same org, using the same boilerplate
  grant-template description text, were auto-merged as one candidate until a conflict veto
  (checking district + start_date, but ONLY between same-schema sources) was added.
- A real Verra record had a **sign-flipped latitude** (+3.09 instead of -3.09) that would have
  broken a true geo-match; the fix flags implausible geo distances rather than trusting them.
- `"Multiple Project Proponents"` (a real Verra placeholder value) was being scored as a
  genuine organization-name mismatch until explicitly treated as "not usable," not "0."
- SRUK stores province in Indonesian ("KALIMANTAN TENGAH"), Verra in English ("Central
  Kalimantan") — BRWA matching silently returned zero results without translation.
- Verra's `registration_date` field came through as a raw Unix epoch-ms integer in at least
  one real record, sitting next to properly-formatted ISO dates elsewhere in the same object.
- **The Verra candidate pool has no country filter and is ~97.6% non-Indonesian** — Verra's
  catalog is global, not Indonesia-only, and nothing upstream of `resolve_candidates()` filtered
  it. Confirmed on real data: 1,929 of 1,976 Verra forestry-sector candidates were some other
  country, comparing (e.g.) a Chinese rice-paddy project against a Zambian REDD+ project as if
  they might be the same entity. Fixed with `run_pipeline(filter_to_indonesia=True)`
  (default on) — Verra only; SRUK/SRN-PPI were checked directly against real data (every actual
  province value across 283 real records is a genuine Indonesian province) and needed no filter.
- **`match.py`'s `resolve_candidates()` had no province pre-filter**, unlike
  `normalize_brwa.py`'s `prefilter_by_admin`, which already used this pattern. Real effect: 2,872
  tentative links, ~70% of them cross-province or cross-country pairs — not a reviewable queue.
  Fixed with `match.provinces_conflict()`: skip the expensive fuzzy comparison entirely when both
  sides have a KNOWN province and it differs (never treat an unknown province as a conflict, same
  "don't default to a negative result" principle as BRWA evidence). Combined with the country
  filter above, cut tentative links from 2,872 to 90 on real data — measured, not estimated.
  **Follow-up found auditing docs, then quantified and fixed the same day.**
  `provinces_conflict()` reused `PROVINCE_LOOKUP_ID_TO_EN`, which only translates 3 of
  Indonesia's 37 provinces (Kalimantan Tengah, Jawa Barat, Riau — see `backend/gluribridge/README.md`
  Open Items #3). Outside those 3, a genuinely same-province SRUK/Verra pair compared
  untranslated Indonesian vs English strings, which are always unequal — a false conflict that
  skipped `match_score()` entirely, so the pair never reached `tentative_links.json` for review
  at all (worse than `tentative` — invisible, not just unmerged). Quantified on the real
  128-candidate registry pool: of 3,671 pairs the pre-filter was skipping specifically because of
  the translation gap, only 21 were a genuine same-real-province false positive (checked against
  an independent ID/EN reference table); none of those 21 shared a matching org name, so none
  were a missed real duplicate. Fixed by requiring translation to have actually succeeded on
  *both* sides (not just both provinces being non-null) before reporting a conflict — falls
  through to "unknown" otherwise, same treatment as an outright-missing province. Deliberately
  does not expand the 3-entry table (a separate, deferrable problem).
  **The fix's effective scope is intentionally kept broad, not narrowed to just the 21-pair
  translation-gap case.** Because Verra's province field is almost always already-English text
  (never a literal key in the Indonesian-keyed lookup table), the fix disables this pre-filter
  for nearly all SRUK-vs-Verra comparisons, not only the ones outside the 3 tracked provinces —
  a deliberate decision, not an unintended side effect: the pre-filter was never reliably
  confirming anything for cross-source pairs to begin with (only 21 real false positives out of
  3,671 gap-path calls, avoided elsewhere mostly by spelling-difference luck, not by the filter
  actually working), so disabling a check that wasn't doing its job isn't a regression. Measured
  before/after on the real registry-only pool (no live API cost): `final_candidate_count`
  unchanged (128 → 128, zero new auto-merges — zero risk of a wrong merge from this change);
  `tentative_link_count` 82 → 155 (+73). Sampled the additions: nearly all are cross-province,
  different-org pairs scoring 62.6-65.0 (well below the 85 auto-merge line, human-glance-only
  noise); one is a legitimate catch that settles the decision to keep the fix broad — "Asia
  Assets Developments Co. Ltd. (PP)" appears as the identical org name across two genuinely
  different real provinces (Maluku, Central Kalimantan), very likely one company with two
  separate real projects. Narrowing the fix back to only the 21-pair case would make this
  specific real, same-org-two-provinces pair invisible again — the exact failure mode this whole
  investigation was about eliminating. All 11 test scripts still pass.
- **The same real SRUK/SRN-PPI registry record was being scraped/saved into BOTH
  `sruk/raw_details/` and `srn_ppi/raw_details/`**, found reviewing the frontend build's
  Katingan detail page: Identity Resolution showed SRN-PPI listed twice with byte-identical
  scores, 4 entries where there should be 3. Confirmed real in the raw data (not a frontend
  rendering bug — the frontend correctly renders exactly what's in `merge_history`), and not a
  one-off: **72 of 283** real SRUK+SRN-PPI raw files share a program_code with a file in the
  other directory, all 72 correctly classifying to the *same* source via
  `normalize_sruk._detect_source()`'s username check (not a legitimate SRUK-native +
  SRN-PPI-native pair — those carry two different registry_nos). This produced the exact
  duplicate-entry artifact on 54 of 128 real candidates (42%) — confirmed it never
  double-counted a final candidate (0 of 72 affected registry numbers produced two separate
  rows; `resolve_candidates()` always auto-merged the exact duplicate at 100%), but it was
  padding the pairwise identity-resolution comparison with 56 redundant records, which also
  inflated `tentative_link_count` — isolated and confirmed on real data: removing only this
  duplication (nothing else changed) took `tentative_link_count` from 155 to 84 on the same
  registry-only pool. Fixed with a dedup guard in `pipeline.py`'s SRUK/SRN-PPI ingestion loop,
  keyed on `(source, registry_no, raw internal id)` — **not registry_no alone**: registry_no
  collision across two genuinely different real submissions was considered but not provably
  ruled out, so the raw payload's own registry-assigned UUID (`raw["id"]`, confirmed present
  and non-null on all 283 real files) is required to also match before treating two files as
  the same record. This choice was validated empirically, not just theoretically: 2 of the 72
  overlapping pairs have a genuinely different `responsible.name` (org) between the two scrapes
  of the same record (one harmless casing difference; one real — "Thryve earth" vs "KOPERASI
  MULTIPIHAK RESTORASI LANSKAP HUTAN SULAWESI" for the identical submission, its internal id
  unchanged) — an org/name content check would have wrongly refused to dedupe a genuine
  duplicate here, which is why the registry's own internal id, not content similarity, is the
  key. Verified on real data with the stronger key: identical result to the simpler
  registry_no-only version (56 skipped, 128 final candidates unchanged) — confirms the extra
  check cost nothing on this dataset while closing the theoretical collision risk. Regenerated
  the full live export same day: Katingan now shows exactly 3 identity-resolution entries in
  both `candidate_details.json` and the frontend; spot-checked two more of the 54 previously-
  affected candidates (Perum Perhutani, Telaga Mas Kalimantan) — both clean. All 11 test
  scripts still pass.
- **News-matching org-name-shape collision** (`news_matching.py`): fuzzy org-name matching alone
  (score ≥85) risked merging two genuinely different, unrelated real Indonesian foundations that
  share a common naming template ("Yayasan [word] Alam/Konservasi Nusantara/Indonesia") — real
  case: "Yayasan Meramu Alam Nusantara" vs "Yayasan Konservasi Alam Nusantara" scored 83.87, and
  the same pool has several more real, unrelated foundations following the identical template.
  Fixed by requiring CONTENT corroboration (the candidate's district/province name, or a
  distinctive project keyword, actually present in the article text — generic domain words like
  "hutan"/"karbon" don't count) for any match scoring in the 80-100 band, not a raw score cutoff.
- **`contact_resolution.py`'s Tier B had two distinct false-positive root causes**, both found on
  real data during the first-ever live Tavily run, both producing a wrong contact on an
  already-`registry_confirmed` real candidate (not a hypothetical):
  1. Signal 2 (first-person self-referential language, e.g. "contact us") accepted the phrase
     appearing ANYWHERE on a page, with no check that the "us" referred to the org being
     searched for. A US Federal Register notice about export-control entity-list additions has
     its OWN generic "Contact Us" boilerplate, unrelated to the Indonesian company it merely
     named — resolved that candidate's contact to a US government agency email
     (`ERC@bis.doc.gov`). Fixed by requiring the org's own slug within a proximity window of the
     self-referential phrase (mirroring the discipline the copyright-footer signal already had).
     Fixing this via the page title specifically introduced a SECOND version of the same bug
     (a certification body's own announcement page about a client company passed via a long
     narrative title merely naming the client) — closed by requiring the org name to occupy a
     whole separator-delimited title segment ("Kontak - OrgName"), not just appear in a sentence.
  2. `domain_match_score` was used only as a sort key, never an acceptance floor — a search
     result could win purely on content self-identification regardless of how unrelated its
     domain looked. Added a floor, but the real evidence gathered proved domain score ALONE
     cannot reliably separate correct from incorrect matches (a confirmed-correct case and a
     confirmed-wrong case scored identically, twice) — it's a cheap sanity filter only, not the
     real defense (which is fix #1 above).
- **Tier B accepted an unfilled website-template email** (`info@your-domain.com`) as a real
  contact. Fixed with a blocklist of known placeholder domains plus a general check that the
  email's domain must relate to (match, or be a subdomain of) the site it was found on —
  generalizes better than the blocklist alone. Required a free-email-provider exemption
  (gmail.com etc.) after it was found to break a real, already-confirmed-correct case
  (a genuine organization using a Gmail address as its public contact).
- **Real registry submissions include test/dummy entries, and nothing filtered them out** —
  found reviewing the actual top of `ranked_candidates.json`: `"PT. UJI COBA"` and a project
  titled `...DUMMY 2026` (both real records present in SRUK's *and* SRN-PPI's raw data —
  4 raw files, one duplicated pair) scored `need_score=100.0` and sat at the top purely because
  an empty/placeholder submission trivially satisfies the need-detection heuristics (no
  documents, no contact, etc.) — the registries' own data, not something the pipeline
  introduced. A third suspected case named alongside these two, `"Direktorat Konservasi
  Ekosistem2"`, was investigated the same way and found to be a real government submission, not
  test data — reported as such rather than folded into the fix just because it was named as a
  candidate. Fixed with `pipeline.py`'s `filter_test_data` (default on, same opt-out-filter
  pattern as `filter_to_forestry`/`filter_to_indonesia`): a keyword pattern
  (`uji coba|dummy|test(ing)?|contoh|sample|percobaan`) checked against `name`+`org` before a
  record becomes a candidate, skips logged to `PipelineResult.skipped_test_data`. Confirmed on
  real data: 130 → 128 registry candidates, the two confirmed test cases gone, the one
  false-positive-suspect (Ekosistem2) correctly still present.
- **Geo/desc weighting can suppress an otherwise-perfect org+name match** (`match.py`):
  confirmed on one real pair (SRUK vs Verra, "PLUM Peat and Mangrove Conservation and
  Restoration Project", org "Pagatan Usaha Makmur") — `org_score` and `name_score` both a
  perfect 100, yet `match_score()` lands at 70.6 (`tentative`, not `auto_merged`) because geo
  carries 45% of the weight in the geo-usable formula and `desc_score` another 15%. Here
  `geo_score` was dragged to 53.1 by a real 23.4km divergence between the two sources' reported
  coordinates (plausible survey-point-vs-boundary-centroid difference, not bad/suspect data —
  well under the 100km `geo_suspect` guard), and `desc_score` to 44.7 because SRUK's description
  is a verbatim-but-truncated prefix of Verra's fuller text (same opening sentence, Verra's just
  continues for ~1,250 more characters SRUK's record never captured) — `token_sort_ratio` scores
  that length asymmetry as dissimilar even though nothing in the shared text actually
  disagrees. `conflict_detected` is `false`, but only because `has_conflicting_evidence()`'s
  district/date check never runs for a Verra pair (gated to `sruk`/`srn_ppi` on both sides) —
  not because a conflict was checked and cleared. **No fix proposed.** `tentative` is judged the
  correct bucket (a human reviews it, nothing wrong silently reaches Gluri), and loosening
  geo/desc weight to let a strong org+name pair override them would risk reintroducing the
  Garut/Cianjur-style false-merge the conflict-veto logic exists to prevent — this is one
  hand-found pair, not a demonstrated systemic pattern, and not worth engineering against with
  the time remaining before Demo Day. Flagged as a known structural property of the current
  weighting for future attention, distinct from the Pagatan/Tanimbar note below (which is about
  the *investigation conclusion*, not this specific weighting mechanism).
- **A real duplicate ("Pagatan Usaha Makmur", same project title, present in both SRUK and
  Verra) investigated and found NOT to be a matching bug.** Calling `match_score()` directly on
  the two real records showed org/name near-perfect but a genuine ~23.4km geo gap, a ~30-day
  registration-date mismatch, a missing province field on the SRUK side, and materially
  different description lengths — `classify_match()` correctly puts this at `tentative`, not
  `auto_merged` or `rejected`, and the pair is genuinely present in `tentative_links.json` for
  manual review rather than silently dropped. Separately, two unrelated pairs that both LOOK
  like duplicates by project title alone (Tanimbar / Gunung Mas Community Forest Restoration
  Project) were confirmed to be real, differently-named organizations (`org_score` 25.8/47.1) —
  correctly NOT merged, not the same pattern as Pagatan.
- **`compliance.py`'s regulatory-rules-file path broke silently during the `backend/` reorg
  (2026-08-27), and it evaded every check run since — found by chance, not by any test.**
  `DEFAULT_RULES_PATH` was computed as two directories up from `compliance.py`'s own location,
  correct when the file lived at the old nested `gluribridge/gluribridge/compliance.py`, wrong
  once the reorg flattened it to `backend/gluribridge/compliance.py` — the path still resolved
  to *some* real directory (the repo root), just not the one `data/regulatory/regulatory_rules.json`
  actually lives under, so `evaluate_compliance()` failed **closed**: every candidate silently
  got `badge: not_applicable` with the real cause buried in a `reason` string
  (`"Regulatory rules file could not be loaded ... [Errno 2] No such file or directory"`) rather
  than an exception a test would catch. Found while wiring the new frontend Dashboard's real KPI
  cards — the "compliance deadline approaching" count came back 0 across all 144 candidates, when
  a real, previously-verified 53-amber baseline was already known from earlier in the session.
  Confirmed the break was introduced specifically by the reorg (not earlier) by checking a
  pre-reorg screenshot, which correctly showed real amber/green compliance badges. **Real impact
  was bigger than the badge display**: `scoring.py`'s N6 signal reads `evaluate_compliance()`'s
  badge and adds real points to `need_score` (+5 amber, +10 red) — so every candidate that
  should have scored amber was also silently under-scored on `need_score` itself, not just
  mis-badged. Quantified precisely: **53 of the 128 real registry candidates had `need_score`
  under-counted by exactly 11.1 points each** (the scaled value of the missed +5), which could
  have changed relative ranking near tied scores, not only the compliance column. The 16
  thin/news-derived candidates were checked and confirmed **not** affected in value — every
  wired rule (R003/R006/R016/R022) requires `registry_ids`/`land_rights_category`, which are
  null on all 16, so they were always going to land on `not_applicable` either way; only their
  `reason` text was cosmetically wrong. Fixed by correcting the path to one directory up, with a
  comment documenting the exact mechanism so a future refactor doesn't reintroduce it blind.
  Verified three independent ways before treating this as closed: (1) a fresh, zero-Tavily-cost
  registry-only `run_pipeline()` reproduced the known-correct historical badge distribution
  exactly (`{'not_applicable': 75, 'amber': 53}` across 128); (2) the live API, queried directly
  (not just the UI) for three of the affected candidates by `candidate_id`, showed `need_score`
  moving from the old value to old+11.1 in every case, with a real, coherent deadline reason
  replacing the buried error text; (3) the dashboard's real KPI card moved from 0 to 53 in an
  actual screenshot. The corrected compliance/need_score data was merged into the live
  `exported_output_stage3/` export and the running FastAPI service's SQLite DB **without any
  new live Tavily spend** — compliance is a pure function of already-known candidate fields, so
  it was recomputed locally and patched in, preserving every existing `candidate_id` (so the
  `candidate_status` "contacted" table and any live references to those IDs were unaffected).
  All 13 pre-existing tests in `backend/tests/` still pass — **and confirmed none of them ever
  exercised `compliance.py`'s output at all**, which is exactly why a fail-closed bug here could
  hide behind a fully green test suite for the entire post-reorg period. Closed that specific
  gap the same day rather than leaving it purely as a documented risk: added
  `backend/tests/test_compliance.py` (14th test), which asserts the rules file actually exists
  at the path the module will use, that at least one real candidate gets a non-default R016
  badge on real data (not an all-`not_applicable` result), and that no candidate's `reason`
  string contains the file-load-failure text — confirmed this new test genuinely catches the
  exact bug class by pointing `GLURIBRIDGE_REGULATORY_RULES_PATH` at a nonexistent file and
  watching it fail loudly with a clear assertion message, not silently pass. All 14 tests pass
  together.
- **A third Verra geo-data-quality case (2026-08-27), found via the candidate-detail territory
  map's sanity sweep — now the third confirmed instance of the same underlying failure mode,
  found via three separate, unrelated routes, worth treating as a standing category of risk for
  any future Verra-derived coordinate, not just these specific records.** Verra project 5620
  ("Carbon Agroforestry in Cimanuk, Progo and Brantas Watershed") carries
  `latitude=7.0909, longitude=107.6689` — the South China Sea, off southern Vietnam — for a
  project explicitly named after three Java rivers, which should sit around -6 to -8 latitude.
  Traced directly to Verra's own raw scrape (`data/raw/verra/runs/*/projects/5620.json`'s
  `.geo.latitude`/`.geo.longitude`), not introduced anywhere in this pipeline. The three
  instances, and how each was found: (1) the original sign-flipped-latitude Seram case above
  (+3.09 instead of -3.09), found via cross-source identity-resolution matching; (2) the
  `match.py` `geo_suspect_data_flagged` mechanism this session already documents (Section 6),
  which generalized (1) into a standing guard — but ONLY for the two-source comparison case,
  since it runs inside `match_score()`; (3) this 5620 case, found by chance during the
  territory-map build's own bounding-box sanity sweep (requested explicitly to check for exactly
  this), which `geo_suspect` structurally cannot catch: 5620 is single-source (Verra only, no
  SRUK/SRN-PPI record to compare against), so it never goes through `match_score()`'s
  cross-source comparison at all. This gap mattered concretely, not just theoretically: a wrong-
  but-present coordinate was earning full "coordinates on file" Geospatial credibility points
  (10/20) and letting the BRWA overlap check run against a bogus point — worse than a missing
  coordinate, which honestly triggers "not yet checked"; a wrong one confidently looked checked
  and clean. (For 5620 specifically, the BRWA check against the bad point happened to find no
  nearby territory either way, so no wrong overlap was actually produced — but the *mechanism*
  that would have let a wrong overlap through was real and open until this fix.) **Fixed**:
  `match.py`'s new `flag_implausible_single_source_geo()` — single-source Verra candidates whose
  point falls outside a generous Indonesia bounding box (-11 to 6 latitude, 95 to 141 longitude)
  get their coordinate nulled back out and a specific `geo_flagged_reason` recorded (surfaced in
  `detail_view()`'s `location` block, distinct from a candidate that never had a coordinate at
  all), run in `pipeline.py` right after identity resolution (so "single-source" is known) and
  before BRWA-overlap attachment and scoring (both of which trust `candidate.latitude` directly).
  **Verified real, quantified impact, not assumed**: before the fix, 5620's `credibility_score`
  was 47.1 (Geospatial 10/20 "Coordinates on file", Land rights 0/25 but with the falsely
  confident reason "No BRWA overlap found within threshold distance" — implying a real negative
  check, when the coordinate it ran against was bogus); after, `credibility_score` is 35.3
  (Geospatial 0/20 "Not yet available — no coordinates on file", Land rights' reason now honestly
  reads "Not yet available — candidate has no coordinates, so BRWA overlap was never checked").
  Before writing the fix, re-ran the same bounding-box check against all 84 candidates without
  any coordinate at all (68 rich + 16 thin) specifically to rule out a fourth hiding instance —
  confirmed there is nothing to check there (a null coordinate can't be outside a box), so the
  60-candidate sweep already run for the map's own Step 4 test was already the complete,
  only-checkable set; exactly one anomaly existed in it (5620) and the fix now resolves it,
  confirmed via a full re-sweep: 0 of the (now) 59 candidates with coordinates fall outside the
  bounding box. Applied to the live export at zero live-Tavily cost, same "recompute locally,
  merge into the existing export, preserve `candidate_id`" pattern as the compliance.py fix
  above — Verra data doesn't require live news/Tier B to regenerate. All 14 tests still pass;
  full Playwright sweep (dashboard, candidates, territory map, Katingan detail, contacted-toggle
  re-render) shows zero console errors both before and after.
- **The connecting bug across all three geo-quality findings (2026-08-28) — the ORIGINAL
  sign-flipped-latitude Seram record (line 2 of this section, Verra project 5283, "Seram Climate
  and Conservation (SERCOVA)") was still carrying its wrong `+3.09` coordinate, live, right up
  until this entry — reported by a real user spotting a map pin sitting in open ocean near
  General Santos, months after the bug was first found.** The real lesson, not just this record:
  **fixing a symptom at the point you found it does not mean the underlying bad data got
  corrected everywhere else it's used.** The original fix (see line 122 and the `geo_suspect`
  entry in this section) was scoped entirely to `match.py`'s pairwise comparison — it stopped the
  bad 707km distance from vetoing SERCOVA's real match against its SRUK sibling ("Seram Climate
  and Conservation Project," `REG-11-PR-VII-2026-3625`), which is genuinely all that specific
  code path could do. But `merge_score()`/`geo_suspect` never mutates either candidate's actual
  stored coordinate — so SERCOVA's own `latitude=3.089999` sailed on, untouched, into every
  downstream consumer that trusts `candidate.latitude` directly: the credibility Geospatial
  component, the BRWA overlap check, and (once built) the territory map — for the entire rest of
  this session, across the compliance fix, the redesign, the React rebuild, all of it — because
  nobody had gone back to ask "was the coordinate itself ever corrected, or just the one place I
  was looking at when I found this?" The 5620 case (this section, immediately above) was found
  independently via the map's own sanity sweep and gave a false sense that the single-source
  bounding-box guard had this class of bug covered — it didn't, because SERCOVA (this record) has
  a cross-source match (SRUK), so it was never single-source, and `3.09/130.47` sits entirely
  inside the guard's own -11..6/95..141 box (wrong hemisphere for what it should represent, but
  not wrong in a way a bounding box can see) — confirmed precisely: `flag_implausible_single_
  source_geo()` never touches SERCOVA at all, by design, since it isn't single-source.
  **Real audit performed before writing anything** (same discipline as the 5620 round): checked
  every one of the 84 real tentative-link pairs for `geo_suspect_data_flagged: true` (or an
  equivalently large distance) — found exactly 2, not assumed to be 1. The second,
  "Tanimbar Community Forest Restoration Project" vs "Gunung Mas Community Forest Restoration
  Project" (both real Asia Assets Developments Co. Ltd. projects, 1993.4km apart, `org_score:
  100`), was investigated with the same rigor and confirmed **NOT** a coordinate error: both
  points are independently plausible for their real, distinct claimed locations (Tanimbar
  Islands, Maluku vs. Gunung Mas Regency, Central Kalimantan) — the same real "one company, two
  distinct real projects sharing an org name" case already documented earlier in this section.
  Also checked every already-merged (auto\_merged) candidate's own `merge_history` for a large
  geo distance that somehow slipped through anyway — found none (the only two entries with a
  computed distance are both a real 0.0km). **The precise discriminator, verified numerically
  before trusting it**: negating one side's latitude and recomputing the haversine distance —
  Seram/SERCOVA collapses from 707.2km to 20.1km (a real sign error); Tanimbar/Gunung Mas gets
  *worse* either way it's flipped (1993.4km → 2095.1km, confirming these are genuinely two
  different real places, not a coding error). **A real bug in the first version of this exact
  fix, caught before it shipped**: the collapse test is symmetric — negating EITHER side of a
  true mirror-image pair collapses the distance equally, so testing "does side A's flip
  collapse it, then does side B's" just returns whichever side is checked first, independent of
  which side is actually wrong. The first implementation nulled SRUK's correct `-3.27`
  coordinate instead of Verra's wrong `+3.09`, confirmed by running it and inspecting the
  output before trusting it. Fixed by using `SOURCE_PRIORITY` (already defined for
  `merge_records()`) as the tie-break: only the lower-priority side of a pair is ever tested for
  a flip, matching the real, repeated evidence this session that the sign-flip defect lives in
  Verra's own scrape specifically (projects 5620 and 5283), never in SRUK/SRN-PPI. **Fixed**:
  `match.py`'s new `detect_latitude_sign_flip()`, called from `resolve_candidates()` for every
  pair `match_score()` already flags `geo_suspect_data_flagged` — that flag itself is what makes
  this safe (it already requires strong independent org/name/desc evidence the pair describes
  the same real thing, so a coincidental geographic collapse between two unrelated candidates
  can never reach this code at all). Nulls the lower-priority side's coordinate and records a
  specific `geo_flagged_reason`, same honest-disclosure treatment as 5620 — never silently
  "corrected" to the inferred-right value, since that would assert a fact only inferred by
  comparison, not independently confirmed. **Verified real, not assumed**: fresh pipeline run
  confirms SERCOVA (not the SRUK sibling) is the one nulled; Tanimbar and Gunung Mas are both
  confirmed untouched; the Territory Discovery map's ocean pin near General Santos is gone in a
  real screenshot; SERCOVA's detail page now shows "Coordinate on file but not trusted" with the
  exact reason instead of a wrong pin; all 14 tests still pass; full Playwright sweep (dashboard,
  candidates, territory map, 15+ sampled candidate detail pages) shows zero console errors.

- **A full, systematic health-check sweep (2026-08-30/31) — the first of its kind this session,
  covering every backend test script + a DB/export consistency check + a page-by-page frontend
  click-through, explicitly framed as a discovery pass, not another targeted fix — found two real
  bugs, one of which uncovered a structural fact about the codebase worth knowing before touching
  candidate identity across pipeline runs again.**
  1. **Contact-resolution export drift, medium severity.** `candidate_details.json`/
     `ranked_candidates.json` on disk had 2 fewer resolved Tier B contacts (InfiniteEARTH,
     PT Pembangunan Aceh) than the live DB, discovered by an independent tally comparison, not a
     manual spot-check. Root cause: `orchestrate.py`'s `run_normalization_and_export()` never
     passes a `tavily_client` to `run_pipeline()` (by design — see Section 7's note on this same
     function), so `resolve_contacts_tier_b` never fires and every registry-only run rebuilds
     `final_candidates` from raw scraper data alone. A Tier B (`org_website`) or human-reviewed
     (`manual_review`) contact only ever exists as a fact recorded by a prior richer run — it
     isn't derivable from raw registry data at all — so a registry-only re-export silently drops
     it. This isn't just a stale-data risk: `scheduler.py`'s background loop runs this cycle
     hourly, and sruk/verra have a 1-day cadence, so an unattended registry-only refresh could
     fire any day and wipe every Tier-B/manual contact resolved so far, not just these 2.
  2. **The first draft of the fix, keyed on `candidate_id`, would have silently done nothing —
     caught by testing against a real simulated reseed, not by trusting the test suite.**
     `pipeline.py` gained a new optional `preserve_contacts_by_registry_key` param (default
     `None`, so all 14 existing test scripts stay byte-identical): restore a prior contact for any
     final candidate that resolved none of its own this run. The very first version of this keyed
     the preserved-contacts dict by `candidate_id` — it passed every existing test (none of them
     exercise this param at all) and looked correct on paper. Running an actual simulated
     registry-only reseed (not just unit tests) to verify it before calling this done surfaced
     that **`candidate_id` is not a stable identifier across separate `run_pipeline()`
     invocations** — `schema.py`'s `UnifiedCandidateRecord.candidate_id` is a fresh `uuid.uuid4()`
     on every construction, and nothing in `normalize_sruk.py`/`normalize_verra.py`/`match.py`
     overrides it deterministically. Confirmed empirically: the exact same real InfiniteEARTH/
     Verra-674 record got `candidate_id` `9a965e64-...` in the live data and `95100ce8-...` in an
     immediately-following rerun on byte-identical raw input — a candidate_id-keyed lookup would
     never match anything real. Re-keyed the fix on `registry_ids` instead (e.g.
     `verra_project_id`), which comes straight from the raw registry file and genuinely is stable
     across runs — confirmed both runs show `"674"`. Also caught a second bug in the same draft
     while re-verifying: `normalize_verra.py` always constructs a non-`None` `RegistrantContact`
     for every Verra candidate (with `contact_source=None` when nothing was found, since "Verra
     gives no named individual contact" per its own comment) — an `is not None` guard on
     `registrant_contact` wrongly treated that as "already resolved" and skipped every Verra
     candidate. Fixed to check `contact_source` truthiness instead, the same pattern the adjacent
     Tier B code already used two lines above it. **Verified for real after both fixes**: a full
     simulated registry-only reseed against a temp export dir (using the real live raw data,
     nothing mocked) restored all 13 of the 13 registry-sourced preserved contacts correctly,
     confirmed by direct before/after comparison per candidate, not just a preserved-count number.
     The other 6 of 19 preservable contacts on file are thin/news-sourced candidates, which a
     registry-only run can't recreate as a candidate at all (a separate, pre-existing, already-
     documented limitation — see Section 7's `run_normalization_and_export()` note — out of scope
     for this fix, and structurally can't be reached by any registry_ids-based key since thin/news
     candidates have none). This is now a permanent structural fact worth internalizing, not just
     a one-off bug: **`candidate_id` must never be assumed stable across pipeline reruns** — any
     future code needing to recognize "the same real candidate" across two separate runs
     (persisted per-candidate state, tracked/partnership status, bookmarked URLs, anything else)
     must key on `registry_ids` instead. Also written directly onto the `candidate_id` field
     itself in `schema.py`, not just here, so it's visible at the exact place someone would look
     when writing code that touches candidate identity.
  3. **`HonestState`'s `compact` variant silently discarded its `children` prop** (frontend,
     `frontend-react/src/components/ui/HonestState.tsx`) — confirmed live on Territory Discovery,
     dropping two real computed disclosure sentences ("86 of 144 candidates have no coordinates
     on file", a geometry-not-found explanation) down to a bare label with no explanation at all.
     The non-`compact` branch already rendered `children` correctly; the `compact` branch simply
     never referenced it. Fixed to render inline (`— Label: children`).
  4. **Two trivial fixes bundled into the same round**: Territory Discovery's "real provinces"
     count was double-counting the `PROVINCE_MULTI_REGION` ("spans multiple provinces") bucket as
     a real named province (fixed 21 → 20, the true distinct-named-province count); the Dashboard/
     Territory Discovery map popup's "View candidate →" link used `href="#"` with a JS-only click
     handler, so middle-click/open-in-new-tab silently did nothing — now a real `/candidates/{id}`
     href, left-click still uses the SPA `navigate()` handler as before.
  5. **Two real, but lower-priority, findings deliberately left open, not forgotten**: the
     Candidates list page has no on-page UI control for province/compliance/contact-resolved/
     need-credibility-threshold filtering — all four work correctly via URL query params
     (inherited from Dashboard KPI-card links) but aren't discoverable from the Candidates page
     itself; and the Dashboard's province/richness breakdown rows aren't clickable, unlike the
     outreach-status panel directly below them which is. Both flagged as real UX gaps during the
     sweep, deliberately deferred rather than fixed in the same round — genuine follow-up work,
     not an oversight.
  All 14 backend tests pass; tsc clean; zero console errors and zero horizontal overflow at
  1600/1440/1280px confirmed across Dashboard, Candidates, Candidate Detail (3 contrasting real
  profiles), Territory Discovery, Tracked/Partnerships, and the Design System page both before and
  after these fixes.

## 7. Current state — what's real, what isn't

See `backend/gluribridge/README.md` for the full, current module-by-module state table — that
is the actively-maintained one. **The repo-root `README.md` is significantly stale** (found
2026-08-27 during the backend/ reorg: its module table, Known Bugs, and Open Items sections all
predate nearly this entire project — Tavily "never called," BRWA "3% coverage," no outreach, no
citations, no frontend/backend, none of it current). Only the directory-layout and startup-
command sections were added there for the reorg; the rest was flagged, not silently rewritten —
a full consolidation is a real follow-up worth doing, not done here since it wasn't asked for.

- **Repo reorganized into `frontend/`/`backend/` and a real FastAPI+SQLite service now exists**
  (2026-08-27). `backend/app/` (`main.py`, `db.py`, `scheduler.py`, `routes.py`) serves the same
  data the frontend previously read from static files, now from `backend/gluribridge.db`
  (SQLite, one row per candidate, full `detail_view()` blob + indexed columns). The background
  scheduler reuses `orchestrate.py`'s cadence/freshness/freeze functions directly (imported, not
  reimplemented) — confirmed live: its first automatic check on startup correctly detected and
  respected `data/.freeze`. 9 endpoints (`GET /candidates`, `/candidates/{id}`, `/dossier`,
  `/outreach`, `/citations`, `/tentative-links`, `/brwa-coverage-gaps`, `/stats`,
  `POST /refresh`). Seeds itself on first startup from `backend/exported_output_stage3/` (no
  live Tavily spend just to start the service). Frontend now calls the live API instead of
  static JSON, fetching candidate detail lazily per-visit rather than preloading all 144 up
  front. **One real mistake made and disclosed during this round**: running
  `orchestrate.py --skip-scrape` to verify the reorg (intended as a read-only check) actually
  overwrote `exported_output_stage3/` with a registry-only 128-candidate run, losing the 17
  Tavily-derived thin candidates and their richer state from the file — caught immediately,
  flagged before proceeding, and restored via one more live Tavily regeneration (144 candidates,
  consistent with the known run-to-run count variance) rather than silently continuing. **Two
  real reorg-caused import bugs found and fixed before either was reported as done**:
  `orchestrate.py`'s `sys.path.insert()` relied on a nested `gluribridge/gluribridge/` structure
  that the reorg flattened; all 13 test files' `sys.path.insert(0, ".")` assumed a CWD the tests
  no longer run from. Both confirmed via an actual failing import before the fix, not assumed.
  **Verified, not assumed**: all 13 tests pass from `backend/tests/`; `orchestrate.py --dry-run`
  correctly resolves the moved `data/.freeze` path and blocks as designed;
  `orchestrate.py --skip-scrape` correctly runs end-to-end from the new location; live API
  responses for Katingan, West Seram, and a real thin/news candidate are byte-for-byte identical
  to the source export file; `POST /refresh` returns 423 while frozen, matching the CLI's exit
  code 3 for the same case; a full 128-candidate sweep against the *live* API (not static files)
  in an actual browser — 0 console errors, 0 broken citation links, the real 83/44/1 outreach
  `recipient_status` distribution confirmed rendering correctly through the whole new stack.
  **One inherited, not newly-introduced, design gap worth knowing about**: `orchestrate.py`'s
  own `run_normalization_and_export()` (reused as-is per instruction, not modified) never
  invoked live Tavily/news-matching/Tier B — that was always true, done separately by hand every
  time this session needed a richer export. This means future *automated* scheduler-triggered
  refreshes will write a registry-only export (like the accidental 128-candidate one above) —
  the initial seed is rich (144, from the last manual live run) but nothing about this task
  wired live Tavily into the scheduled path itself. Flagging as a real gap, not fixing it here,
  since expanding `run_normalization_and_export()`'s scope wasn't part of what was asked.
- **Citation linking now exists** (`citations.py`), a pure annotation layer run after
  `scoring.py`/`dossier.py` — every `need_detection_reason` and `credibility_components` reason
  carries a real `{source_type, url, retrieved_at, note}` citation, resolved from data already
  on the candidate: a real document URL from `candidate.documents[]` (matched against the REAL
  section/sub_section taxonomy confirmed on the actual dataset, not guessed — e.g. "Has a DRAM
  or DPP on file" resolves to Katingan's actual "Dokumen DRAM" PDF), a real BRWA decree PDF from
  `brwa_overlap.legal_documents`, a real news article URL (matched from the reason's own
  embedded URL, or — a real bug found and fixed — a thin candidate's *founding* news hit, whose
  URL lives in `merged_from`, not `news_evidence`, which is populated by corroboration, a
  separate process), or an honest no-single-document note when none exists (never a fabricated
  link). Audited first, per instruction, before designing anything: `field_sources` (suspected
  dead like `name_en`) is real and populated in 5 places (`normalize_sruk.py`,
  `normalize_verra.py`, `normalize_brwa.py`, `contact_resolution.py`, `news_matching.py`) — grep
  evidence, not assumed. Three real bugs caught before shipping, each found by checking actual
  output against every real candidate rather than trusting the first working example: a
  wrong-polarity note on the "no full geometry" geospatial reason (implied no coordinates when
  coordinates ARE present), the same wrong-polarity gap on "no coordinates at all" falling
  through to a generic "Unmapped" catch-all, and the merged_from/news_evidence confusion above.
  **Frontend wiring was corrected from optional to a hard requirement mid-task** (a citation
  that only exists in JSON solves nothing for someone who needs to click through to the real
  source) — `frontend/index.html` renders a real clickable link (real `<a>`, opens the actual
  source in a new tab) wherever a reason is shown (Need score panel, Credibility score panel,
  Dossier's Why Gluri and Land & regulatory sections), or honest plain text when there's no
  document, never a dead/fake link. Fixed a related pre-existing frontend gap while at it: the
  Land Rights panel's "formal category" state showed zero links even though the real decree URL
  was sitting right there in `brwa_overlap.legal_documents` alongside it — same data, was just
  never displayed. Verified in an actual browser, not just JSON: Katingan's DRAM and BRWA-decree
  citations each triggered a real, captured download event to two different, correct real URLs
  (`context.expect_event("download")` — PDF links trigger a download in headless Chromium, not
  a page load, so proving this needed the real download-event API, not just a page-load check);
  the no-single-document case showed honest plain text, 0 dead links; a thin/news candidate's
  citation opened the real originating article URL. Full sweep across all 128 real registry
  candidates in the actual rendered page: 0 broken/dead citation links, 0 empty honest-notes, 77
  real clickable citations and 1,293 honest no-document notes rendered correctly. All 13 test
  scripts pass (`test_citations.py` added).
- **The live Tavily API call has now actually run** — first executed 2026-08-26, staged
  (smoke test → 3-province controlled batch → full run across all 37 real provinces). Real
  response schema matched what `tavily_client.py`/`news_matching.py` assumed on the first try,
  no client changes needed. `compliance.py` now reads the real 25-rule table (4 wired, 21
  flagged — see the Permenhut glossary entry above), not hardcoded constants.
- **Tier C contact resolution (extracting a named contact from news-article prose) — deliberately
  not pursued, not an oversight.** Reasoning: Tier B, the structurally easier of the two
  remaining tiers, required four separate hardening rounds this session — a real false positive
  routing a candidate's contact to a US Federal Register notice, two distinct root causes behind
  it, a placeholder-email bug (both in Section 6 above), and a documented residual short-slug
  collision (this section, below) — before it was trustworthy enough to resolve just 1 of 128
  real candidates. Tier C has no equivalent structural anchor to verify against — no copyright
  footer, no dedicated contact page — making a false positive here harder to catch than anything
  Tier B faced, for candidates where a named individual may not even appear in the source
  article most of the time. The 44 of 128 real candidates currently landing in
  `insufficient_contact` are not a gap to close before Demo Day — that status is the accurate,
  honest answer for those candidates (no contact tier has found anything, and `outreach.py`
  correctly refuses to generate a fabricated email for them, per the same "don't default to a
  negative-looking gap" principle everything else in this pipeline follows). Revisit only if
  post-Demo-Day priorities specifically call for it, and expect a hardening effort at least on
  par with Tier B's.
- **Outreach email generation now exists** (`outreach.py`, English-only v1), same template-based/
  no-LLM philosophy as `dossier.py`. Distinguishes `name_only_no_email` (Tier A — full email,
  flagged "needs manual lookup" before sending) / `email_only_no_name` (Tier B — generic org
  salutation, real address) / `insufficient_contact` (refuses to generate, same honesty pattern
  as thin-candidate `suggested_poc`) rather than a single has-contact boolean — confirmed this
  is the real, verified shape of the data (every Tier A of 83 real contacts has name+no email;
  every Tier B of 1 has email+no name — an earlier "5" floated during the initial build counted
  Tier B resolutions across all final candidates including thin ones, not just the 128 real
  registry candidates this whole doc otherwise scopes to), not assumed from a handful of
  examples. Fact-tagged
  `why_gluri` reasons are stated plainly; hypothesis-tagged ones are hedged in the same
  sentence-by-sentence pass — the highest-stakes place for that discipline, since it's the one
  output an external recipient actually reads. **Bilingual (ID/EN) is now built too** —
  reversed the earlier "wait for an LLM-polish layer" guidance specifically for outreach (that
  reasoning holds for `dossier.py`'s internal-only text, not for a customer-facing translation
  that needs the same exactness guarantee as the hedging language itself). Every email carries
  both languages by default, English first then Indonesian below a labeled divider. Only
  outreach.py's own FIXED strings (salutation, subject, company intro, sign-off, the hedge
  wrapper — `"tampaknya"`) got real twins; the dynamic why_gluri/suggested_poc/next_questions
  text stays English in both language sections since `dossier.py` has no Indonesian output to
  draw from — stated explicitly as a scope boundary, not silently narrowed. The Indonesian hedge
  is pinned down with its own explicit assertion, the same discipline as the English one. **Now
  has a real frontend home** too, not just a JSON
  field — `frontend/index.html`'s detail page has its own Outreach panel (same pattern as
  Compliance/Dossier), showing the warning prominently for `name_only_no_email`/
  `email_only_no_name`, and a plain refusal (not an empty/broken section) for
  `insufficient_contact`. Full-sweep verified against all 128 real registry candidates —
  0 JS errors, 0 rendering failures, and the exact real distribution (83/1/44) confirmed
  rendering distinctly. One process note: `outreach.py` was built and wired into
  `export.py`'s `detail_view()` in one round, but `exported_output_stage3/candidate_details.json`
  wasn't regenerated until the next round (a real, confirmed gap — the artifact and the code
  had drifted). Fixed without spending a live Tavily run: `generate_outreach()` is a pure
  function of `contact` + `dossier.structured`, both already present in the existing export for
  every one of its 145 candidates, so the export was patched in place rather than re-derived
  from scratch — mathematically identical to what a full re-run would produce, zero API cost.
- **BRWA geometry coverage is 1,756 of 2,283 territories (~77%)**, not the ~3% (72) the
  originally-delivered sample implied — the real data is far more complete than the sample
  snapshot. A targeted re-crawl of the remaining 527 (2026-08-26) confirmed they genuinely have
  no embedded geometry on BRWA's own site (not a crawl gap) — 77% is the real ceiling, not an
  in-progress number. All 2,283 have their policy tier classified from the list either way,
  which is a separate, cheaper thing.
- **A meaningful share of "no coordinates on file" candidates on the map isn't a gap in this
  pipeline at all — it's a systemic pattern in SRUK's own source data, quantified while tracing a
  real user report (2026-08-31) that Jawa Barat and Jawa Tengah showed candidates in the province
  breakdown but zero dots on the map.** Traced precisely, not guessed: all 14 Jawa Barat and all 5
  Jawa Tengah candidates are single-source SRUK submissions whose raw `location.latitude/
  longitude` is `-2.4, 118.8271` — a national-centroid placeholder, not a real per-project GPS
  value — which `normalize_sruk.py`'s existing `KNOWN_PLACEHOLDER_COORDS` guard (added earlier
  this session after the Garut/Cianjur/Katingan-Mentaya cases) already correctly detects and nulls
  out rather than trusting. Checking this guard's real hit rate across all 92 raw SRUK files
  found it isn't a rare edge case: **42 of 92 (46%) carry this exact same placeholder value**,
  vs. 36 genuinely-`null` locations and only ~14 with distinct, plausible real coordinates —
  meaning SRUK's own submission form doesn't always require (or doesn't always collect) a real
  project location, and close to half of all SRUK-sourced candidates were never going to have one
  on file regardless of anything this pipeline does. No code change needed — the guard is already
  working correctly for both provinces, confirmed live (map + the "X of Y have no real
  coordinates" disclosure chip both show the exact honest count for each). Worth having on hand
  as a real number, not just "some candidates lack coordinates," any time the map's actual
  coverage ceiling needs explaining.
- **Permanent residual limitation, not an open task: very short/generic org-name fragments can
  still produce a wrong Tier B contact.** `contact_resolution.py` gates its two weaker
  self-identification signals off entirely for org slugs under 7 characters (fixed a real
  acronym collision: "PT RMU" → Robert Morris University's `rmu.edu`, an unrelated US
  university sharing the same 3-letter acronym) — but the strongest signal, the copyright-
  footer check, is NOT immune to this and was deliberately left as the only path for short
  names anyway: a short org-slug collision there (confirmed real: "PT Carbon" → "Carbon Creek
  PT", a different real company whose own genuine copyright footer legitimately contains the
  word "carbon") is a substring collision between two differently-named real organizations, not
  a looseness in the check — gating the copyright signal too would remove the one path that
  legitimately works for short real org names, trading a rare failure for a more common one.
  Tied to a separate, upstream cause: short/generic org strings like "PT Carbon" are usually
  themselves a symptom of imperfect org-name extraction in `news_matching.py`'s
  `extract_org_candidates()` (already documented there as hypothesis-tier, not exact), not a
  contact_resolution.py-only problem.
- ~~No FastAPI service, no database, no real frontend.~~ **All three now exist** (2026-08-27,
  see the reorg/FastAPI entry earlier in this section for the full writeup) — `backend/app/`
  (FastAPI + SQLite), `frontend/index.html` calling the live API. `backend/orchestrate.py` is a
  thin scheduler-like layer above ingestion and `gluribridge.pipeline.run_pipeline()` —
  daily/monthly per-source re-scrape cadence (SRUK/Verra daily, SRN-PPI monthly, BRWA manual)
  **is the designed product capability**, not a stopgap; the FastAPI background scheduler now
  invokes this cadence logic automatically instead of only by hand via the CLI. See its own
  docstring for the cadence table and the `data/.freeze` mechanism (below).
- **Data is deliberately frozen from 2026-08-26 through Demo Day (5 September 2026) for
  rehearsal stability.** `data/.freeze` exists on purpose — `orchestrate.py` refuses to run any
  scraper (regardless of cadence-due status or `--force`) while it's present, so the candidate
  set stays fixed for demo prep. This is NOT a limitation of the cadence design above — it's a
  deliberate, temporary override of it. Do not `--unfreeze` before Demo Day without a specific
  reason to.
- **`export.py`'s `ranked_candidates.json` sort has a display-only tiebreaker**, added because
  `need_score`/`credibility_score` are small discrete sums with heavy real clustering (e.g. 19
  of 128 real candidates tie at `need_score=100.0`; only 6-8 distinct values exist across either
  score on real data — expected given the scoring design, not an anomaly). Ties now break on
  `(need_score desc, credibility_score desc, has_resolved_contact desc, document_count desc)`.
  This is purely a UI/export presentation concern — it does not feed back into `need_score` or
  `credibility_score`, is not persisted as a rank/priority field, and is not a scoring component
  anywhere in `scoring.py`. `has_resolved_contact` (new `list_row()` field) is deliberately
  broader than the pre-existing `has_named_contact` field: Tier B (`org_website`) resolutions
  only ever populate `.email`, never `.name`, so `has_named_contact` alone would misread a real
  resolved Tier B contact as "no contact."
- **Two real UX gaps found during the 2026-08-30/31 health-check sweep, deliberately left open,
  not fixed in the same round — genuine follow-up work, not forgotten.**
  - The Candidates list page (`frontend-react/src/pages/CandidatesListPage.tsx`) exposes only
    richness/status dropdowns and a search box. Province, compliance-flag, contact-resolved, and
    need/credibility-threshold filtering all work correctly as URL query params
    (`minNeed=`, `compliance=`, `hasEmail=`, etc. — confirmed via direct navigation and combined-
    filter AND-logic tests) but have no on-page control; they're only reachable today via a
    pre-built Dashboard KPI-card link. A user starting from the Candidates page directly can't
    discover or apply them.
  - The Dashboard's province and data-richness breakdown panels aren't clickable, unlike the
    outreach-status panel directly below them, which is wrapped in real
    `<a href="/candidates?status=...">` links. Same page, same visual pattern, inconsistent
    interactivity.
- **Real activity-type classification, built 2026-08-31 — deliberately tested against real data
  BEFORE building any UI, per the mentor's own stated threshold** ("if 40-50% falls into Unknown,
  the category is weak"). First test: 43 real titles (25 SRUK/SRN-PPI + 18 Verra), hand-classified
  by keyword, found 67% classify (42% single-category, 26% genuinely multi-tag — e.g. "PLUM Peat
  and Mangrove Conservation and Restoration Project" is honestly Peatland + Conservation +
  Reforestation all at once), 33% Unclear — below the failure threshold, not a comfortable margin.
  Widened the keyword list (added `tutupan hutan`, `kebakaran hutan`+`patroli`/deforestation-
  reduction language — each checked against all 144 real candidate names first to confirm no new
  false positives before trusting them) → 72% classify, 28% Unclear on the same sample. Split
  "Unclear" into two real, distinct states rather than one blended bucket (mirroring the same
  "not yet checked" vs "no overlap found" honesty pattern used everywhere else in this app):
  **Unclassified** (a real forestry candidate this classifier's keyword/field coverage doesn't
  reach — a coverage gap) vs. **Not applicable** (the real underlying activity genuinely isn't a
  forestry land-use type at all). The Not-applicable case is detected structurally, not guessed
  from title text — Verra's own `afolu_activities` field (e.g. "ARR", "REDD,WRC"), confirmed real
  against this project's own 45 final Verra candidates: 44 carry at least one forest-related code
  (ARR/REDD/IFM/WRC), exactly 1 (AgriCapture Southeast Asia Rice Methane Project, methodology
  VM0051, rice-paddy-irrigation methane reduction) carries only "ALM" with none. That same field
  also revealed a genuine 5th category worth adding alongside the mentor's original 4 —
  **Improved Forest Management (IFM)** — a real, common Verra activity type, not a keyword miss
  (confirmed on "JATI DHARMA INDAH PLYWOOD INDUSTRIES IFM PROJECT 1", real code "IFM", not one of
  the other 4 categories at all). **Final real numbers, all 144 live candidates, all 5
  categories**: 95 classified (66.0%), 48 Unclassified (33.3%), 1 Not applicable (0.7%) — rich
  candidates alone classify at 73% (Unclassified 26%), thin/news candidates at only 6% (94%
  Unclassified) — expected and structural, not a keyword gap: a news-headline title just doesn't
  communicate a specific forestry activity type the way a real project title does. Category
  tally (candidates can carry several): Reforestation 55, Social forestry 33, Conservation 31,
  Peatland 29, Improved Forest Management 11. **A real bug caught mid-build, not shipped**: the
  first draft of `_not_applicable()` gated its check on `candidate.primary_source == "verra"`;
  patching this classification onto the live 144-candidate dataset surfaced that some real
  candidates' audit-trail `merge_history` mixes contact-resolution provenance tags
  (`manual_review`, `tavily_contact_lookup`) in with genuine identity-source tags, making any
  `primary_source` string derived from that history order-dependent and unreliable. Fixed by
  gating purely on whether real `verra_afolu_activities` codes are present at all (SRUK/SRN-PPI/
  news never populate that field, so the check is already correct for them with no source-label
  dependency needed) — simpler AND correct regardless of how a candidate's identity was merged.
  Built: `gluribridge/activity_type.py` (pure function, no LLM, multi-tag), a new
  `verra_afolu_activities` field on `UnifiedCandidateRecord` (populated by `normalize_verra.py`
  from Verra's own raw `overview.afolu_activities`), wired into `pipeline.py`/`export.py`/`db.py`,
  a `Filter` + `ActivityTypeBadges` component pair on the frontend (Candidates list column +
  filter dropdown, Candidate Detail page header, Unclassified/Not-applicable rendered via the
  same `HonestState` pattern as everywhere else in this app, with two genuinely distinct labels/
  reasons — never one blended "Other"). All 15 backend tests pass (14 prior + the new
  `test_activity_type.py`); tsc clean; zero console errors and zero horizontal overflow at
  1600/1440/1280px across every page. One real layout bug found and fixed during this same round:
  the shared `CandidateTable` (Candidates list + Tracked/Partnerships) had two percentage-width
  columns (Project name/Organization) that `table-fixed` was crushing to 48px/37px once the new
  fixed-width Activity-type column pushed total fixed-pixel width too high — fixed by converting
  those two to fixed minimum widths instead, letting the table grow wider than its wrapper and
  scroll horizontally within it (already had an `overflow-auto` wrapper for exactly this) rather
  than ever crushing the two most identity-critical columns in the table.
- **Live production deployment now exists** (Render, free tier) — a real Static Site
  (`frontend-react/dist`) plus a real Web Service (`backend/`, FastAPI). Not documented anywhere
  in this file until now, a genuine gap. `frontend-react/src/lib/api.ts`'s `API_BASE` was
  hardcoded to `localhost:8000`; fixed to read `import.meta.env.VITE_API_BASE` so the deployed
  static build can point at the real live backend URL. Render does **not** support Netlify's
  `_redirects` SPA-fallback convention at all — confirmed via WebFetch of Render's own docs after
  a `_redirects` file was added, deployed, and empirically did nothing; the working mechanism is
  a dashboard-configured rewrite rule (`/*` → `/index.html`, Rewrite action), verified via curl
  against 4 real routes returning real 200s instead of 404s.
- **A real, significant BRWA data gap shipped to production and went undetected until live
  backend logs were checked** — the single biggest data-completeness bug found this session.
  `.gitignore`'s blanket `backend/data/raw/` exclusion (originally added only to keep the ~9.8GB
  BRWA PDF archive out of git) also excluded `backend/data/raw/brwa_geojson/geojson/` (149MB,
  1,756 real polygon files) and `backend/data/raw/brwa_profiles/wa_list.json` (1.1MB, the full
  2,283-row BRWA list) — both genuinely read live, per-request, by `app/territories.py`. Neither
  was ever pushed to GitHub, so the live Render deployment silently ran with `brwa_territories:
  {total: 0, with_geometry: 0}` instead of the real `{2283, 1756}` — every `/territories/{idx}/
  geometry` request 404'd, `/territories?search=` returned `[]`, for the entire time the site was
  live before this was caught. Fixed with precise multi-level gitignore negation (blanket
  exclude, then re-include the two needed subpaths, then re-exclude everything else under
  `brwa_profiles/` except `wa_list.json` specifically — the ~9.8GB PDF archive stays excluded),
  verified via `git add -n` dry-runs on 8 separate paths (both should-ship and should-stay-
  excluded) before committing, not just visual pattern-reading. 1,758 files (~150MB) pushed.
- **Frontend underwent a substantial mockup-driven visual overhaul this session** (Dashboard,
  Candidates List, Candidate Detail) — not previously logged here at all. Dashboard: icon-bearing
  KPI cards, collapsible sidebar, panel footer links. Candidates List: replaced the table with a
  responsive card grid (3-column wide / 1-column narrow), pagination (24/page), a Sort-by control,
  a 3-state `ContactReadinessIndicator`. Candidate Detail: `WhyContactFirst` promoted to a real
  visual hero (score_label + suggested action + contact route + top why_gluri reason cards, all
  merged into ONE bordered container, not split across two — an early version had them as two
  separate boxes, corrected same session), a persistent `KeyGapsSidebar` (4 real gap signals,
  click-to-jump), a `TrackingSummaryCard` (status/registry badges, moved out of the main content
  column into the sidebar — was sitting inline with pipeline-computed evidence it had no thematic
  relationship to). Evidence display across the page uses progressive disclosure (3 levels: an
  always-visible fact/hypothesis-tagged claim; an opt-in "ⓘ" `InfoPopover` for the full citation
  detail; the Dossier tab's already-existing full evidence trail, left untouched) — built for the
  Need/Credibility score reason lists and the 21 unwired compliance rules (demoted to a single
  muted sentence + expand-to-see-detail, no longer competing visually with the 4 wired rules).
  `HonestState`'s compact chips gained a visible "ⓘ" info-icon symbol whenever real hidden content
  (a `title` tooltip) exists — previously a compact chip's only signal of hover-content was
  invisible. A new `WarningBanner` component (headline + muted supporting line, `AlertTriangle`
  icon) replaced an ad-hoc "⚠ {one run-on sentence}" div for the Outreach tab's real actionable
  warnings — deliberately NOT built on `HonestState`, which is explicitly not styled like an
  alarm (the wrong register for a real blocker).
- **A real internal-jargon-to-plain-language translation pass** (frontend + one backend
  copy-generation function) — a full grep-based inventory was done first, confirmed with the
  user, before any wording changed. Fixed: "Tier A/B/C" language dropped from all user-facing
  text, including `dossier.py`'s `_contact_route_text()` (the source of "found directly in the
  official registry record" / "found via the organization's own website" / "mentioned in a news
  article" wording, rendered on every candidate's hero panel and Dossier tab); raw internal
  `rule_id` codes (e.g. `"R016"`) dropped from both the 4 wired compliance rules and the 21
  not-wired ones, since the real Pasal citation is already embedded in each rule's own reason
  text; BRWA's raw `policy_tier` enum (`penetapan`/`pengaturan`/`belum_ada`) translated to plain
  English everywhere it renders; `match_status` (`auto_merged`) translated; a bare, unexplained
  "capped" badge on the Credibility score gained a real tooltip. **One deliberate correction to
  the user's own proposed wording, caught during verification**: Tier B's contact-route sentence
  was proposed to use `{contact.name}`, but Tier B (`resolve_contact_tier_b`) only ever resolves
  an email, never a name — using `{contact.name}` there would have rendered blank/"None" for
  virtually every real Tier B candidate. Kept `{contact.email}` instead, documented at the fix
  site. Regenerating the export for this required care: a full `run_pipeline()` re-run has no
  live Tavily client in this environment and would have silently dropped the 16 news-derived
  thin candidates (144→128) — caught via `git diff` before it was ever committed, reverted, and
  redone as a surgical patch of just the affected text fields instead.
- **`RegistrantContact` gained a Tier B contact-search audit trail** (`contact_tier_b_attempted_at`,
  `contact_tier_b_attempt_result`) — purely additive, doesn't feed scoring/compliance/
  `recipient_status`. Exists because a real question came up ("has manual/Tavily research
  already been attempted against the top-need candidates?") that the data model had no way to
  answer: a "no email on file" candidate looked identical whether Tier B was never tried or was
  tried and genuinely found nothing. A real, live, targeted Tier B pass was run against the 19
  candidates tied at `need_score=100.0` (all Tier A, name-only) — **0 of 19 found an email**,
  applying the same self-identification+extractable-email bar Tier B always uses, not a loosened
  one. Contact-readiness wording (the small list-view indicator, the Key Gaps sidebar, the
  Outreach warning) now distinguishes "never searched" from "searched, found nothing" using this
  field — same visual treatment everywhere, wording only. **`preserve_contacts_by_registry_key`'s
  real production entry point was verified end-to-end for the first time this session** (see
  Section 6's contact-resolution-export-drift entry for its original, standalone-script-only
  verification) — called the actual `scheduler.run_refresh_cycle(skip_scrape=True)` production
  function chain (not a hand-rolled simulation), with `orchestrate.EXPORT_DIR`/`db.DB_PATH`
  monkey-patched to disposable temp locations so nothing live was touched (confirmed via SHA-256
  hash comparison of the real export/DB files, unchanged before/after); the real `POST /refresh`
  endpoint was separately confirmed, live, to correctly return HTTP 423 while `data/.freeze` is
  in place. **Known gap, safe to leave until after Demo Day**:
  `contact_tier_b_attempted_at`/`contact_tier_b_attempt_result` aren't covered by
  `preserve_contacts_by_registry_key` — a future registry-only refresh would silently drop this
  audit trail for previously-attempted candidates (Tier A contacts are always freshly rebuilt
  from raw registry data on every run, never treated as needing preservation, so this field never
  gets a chance to be restored). Safe to leave since data is frozen through Demo Day and no
  refresh will run before then.
- **A purposeful, subtle motion pass was added across the app** (2026-08-31) — pure CSS plus a
  small `useCountUp` hook, no new dependency. Dashboard KPI cards count up from 0 on mount
  (~500ms ease-out, `requestAnimationFrame`-based, opt-in via a new `animateValue` prop scoped to
  the Dashboard's 4 `lg` cards only); Opportunity Matrix dots fade+scale in on load, staggered
  ~3ms/dot capped at 300ms total; a shared `.hover-lift` utility (scale 1.015 + shadow) applied
  identically across Dashboard KPI cards, Candidates List cards, and Territory Discovery's two
  clickable row types (search results, confirmed-overlap territories); Candidates List cards fade
  in on mount/filter/page change, staggered ~15ms/card capped at 250ms, keyed by `candidate_id` so
  a row that persists across a filter change doesn't replay the animation, only rows genuinely new
  to the visible set do. `prefers-reduced-motion` respected throughout — collapses every
  animation/transition to near-instant, never hides the end state outright. Verified: tsc clean;
  sequential screenshots confirmed the KPI count-up mid-animation (142→144, 52→53 across frames)
  and the hover-lift's shadow+scale on a real card of each of the three types; 0 console errors /
  0 overflow across 9 pages × 3 widths.
- **The citation no-document label was reworded** from "No single source document" to "Confirmed
  — from a live record, no file to link" (2026-08-31, the user's own wording, chosen over an
  initially-proposed alternative) — the old phrasing read more negative than the real situation:
  this is a citation-system limitation (the underlying fact IS sourced — a registry field or a
  computed signal — just not backed by a single downloadable file), not a data gap. Scoped tight
  per explicit instruction: only `HonestState.tsx`'s `no_source` default label changed; every
  other honest-disclosure state (not yet checked, no coordinates, no contact found, not_trusted,
  insufficient) kept its direct "no"-led phrasing untouched, since that bluntness is this app's
  actual trust mechanism, not something to soften. Confirmed via a full grep first that the only
  other match anywhere was an unrendered code comment in `citations.py`'s own docstring.
  `DesignSystemPage.tsx`'s 2 reference examples updated to match, so the page doesn't show an
  internally-contradictory example (a "Confirmed" chip whose hover tooltip still said the old
  phrase). Verified: tsc clean; screenshot + title-attribute check on Katingan confirmed the new
  label renders and the original full reasoning text is preserved verbatim in the tooltip.
- **The whole frontend was rolled out onto a new "field-instrument" visual direction** (satellite
  telemetry meets field cartography, 2026-08-31) — approved first as a single Dashboard-only test,
  then extended page by page with an explicit per-page re-verification checklist, because the app
  "still read as a generic SaaS dashboard despite many rounds of polish" and the ask was for
  something rooted in what this product actually is, not another round of generic polish. Sharp
  corners, hairline borders, no drop shadow (`.instrument-panel`, opt-in via `variant="instrument"`
  on `Panel`/`KpiCard`, every default unchanged everywhere else); live-pulse dots on numbers that
  are read fresh from the API on every page load; a paper background plus a hand-authored tileable
  topographic-contour SVG watermark (`.bg-field-paper`/`.topo-watermark`, scoped to each page's
  scrolling content area — confirmed via a direct card/gutter-boundary screenshot to never render
  under opaque white card content); and "accent restraint" — each screen keeps exactly one warm
  clay accent on its single most important need/action number, muting every other decorative
  forest/teal/amber usage to ink/stone, while never touching functional data-encoding color (score
  -axis colors, map marker/legend colors, status/evidence tags, teal as this app's own established
  geospatial-evidence signal, genuine primary-action buttons). Rolled out in order: Dashboard (the
  approved test) → Candidates List (KPI toolbar, filter chips, pagination) → Territory Discovery
  (all 7 panels, map container, exec summary; teal deliberately kept on the BRWA-overlap badge and
  map legend) → Candidate Detail (the highest-risk page, re-verified on 2 contrasting candidates:
  equal-height score cards measured via real `getBoundingClientRect()`, rail/tab scroll-sync in
  both directions, mailto presence/absence, popovers, the hero merge, compliance demotion) →
  Tracked/Partnerships (caught and fixed a real 2-accent competition — "Contacted" and "Done" were
  both forest) → Design System (a new "Field instrument variant" section documenting default vs.
  instrument `Panel`/`KpiCard` side by side, both background options, and the accent-restraint rule
  in prose). **One real CSS bug found and fixed mid-rollout**: `.instrument-panel`'s own
  `border-width: 1px` rule would race against Tailwind's own `border-t-2` utility on CSS
  source-order specificity, silently flattening a colored accent stripe back to 1px — caught before
  it shipped, fixed by removing `border-width` from the shared class entirely (now only
  `border-radius`/`box-shadow`) and auditing every usage site to confirm it brings its own explicit
  Tailwind border-width utility. Held deliberately uncommitted across many rounds per explicit
  instruction until every page was done and confirmed as one coherent whole, then committed as a
  single rollout commit. Verified: tsc clean; a final 8-route Playwright sweep at 1600px — 0
  console errors, 0 horizontal overflow on every route.
- **A permanent "How this works" / data-sources page now exists** (`/how-it-works`, 2026-08-31) —
  a single page, reusing the existing design system with no new visual language, built
  specifically so it can't silently drift the way this project's own docs have drifted before
  (see the repeated "found stale, corrected" entries throughout this section). Every number on it
  is fetched live (`GET /stats`, the shared `useCandidates()` hook, and one `GET /candidates/{id}`
  call for the live wired-vs-total Permenhut rule count) rather than typed in as static text.
  Five sections: data sources (SRUK/SRN-PPI/Verra/BRWA/Tavily, one sentence each, real live
  per-source candidate counts — honestly notes that `sruk_and_srn_ppi_input` is a combined raw
  count the backend doesn't currently split by source); how scoring works (need vs. credibility,
  never combined into one ranking, the real N1-N6 need rules and the 4 credibility components in
  plain language, no rule codes); how compliance is checked (the live 4-of-25 wired-rule count,
  read from a real candidate's own `scoring.compliance` response, not hardcoded); why no LLM is
  used anywhere in scoring/dossier/outreach (the deliberate trust decision, one paragraph);
  contact resolution (the established three-tier plain-language explanation plus the real,
  current has-email/weak-match/name-only/nothing breakdown, which sums exactly to the total real
  candidate count). Verified: tsc clean; Playwright sweep at 1600/1440/1280px, 0 console
  errors/overflow at any width; sidebar nav link confirmed clickable from another page.
- **`RegistrantContact` gained phone/WhatsApp fields** (2026-09-01) — never existed before; only
  name/email were ever captured. Added ahead of running any real phone-focused search: `phone`
  plus its own provenance trio (`phone_source`, `phone_source_url`, `phone_confidence`),
  deliberately separate from the email/name provenance fields (a phone-specific search often hits
  a different page/result than whatever resolved the name), plus `contact_tier_c_attempted_at`/
  `contact_tier_c_attempt_result`, the same "never searched" vs. "searched, found nothing"
  audit-trail shape as the existing Tier B fields. All fields optional/additive; `export.py`
  needed no changes (serializes via `asdict()`); `app/db.py` gained matching
  `has_phone`/`contact_tier_c_attempted` derived list-row fields, mirroring
  `has_email`/`contact_tier_b_attempted` exactly.
- **First real Tier C round — manual, not automated** (2026-09-01): a real, scoped Tavily search
  (`search_depth="advanced"`, 4 query variants — "whatsapp"/"kontak hp"/"nomor telepon"/"nomor
  kontak" — per candidate, 76 real calls total, no automated pipeline change) against the same 19
  candidates already confirmed Tier-B-searched-and-found-nothing (the need_score=100 tied
  cluster). Deliberately read and judged by hand, not regex/LLM-decided — the whole point being to
  catch exactly the kind of false positive a keyword match would rubber-stamp (an Instagram
  highlight-story URL fragment that regex-matched as a 17-digit "phone number"; a village
  government's own site-wide footer contact block sitting right next to a KTH group's profile; a
  news outlet's own "place an ad via WhatsApp" link; a platform's own support-chat widget). Result:
  **1 high-confidence WhatsApp** written (Momua Journey, via its own official Facebook Page contact
  block, exact org+province match) — `phone_confidence="high"`. **1 real org phone written for 2
  candidates** (Yayasan PILI-Green Network — same legal org registered separately for a Papua and
  an NTT project — found in its own verified Instagram bio) — a landline, not a personal or
  WhatsApp-capable number, so given a new, distinct third `phone_confidence` value,
  `"general_office_line"`, rather than folded into `high` (not personal/direct) or `medium` (not
  uncertain — the org match itself is solid). **2 deliberately NOT written** despite a real
  org-name+location match (KTH Wana Mandiri Wangi, KTH Geralang Asri Jaya) — same
  right-place-wrong-holder pattern as an MOU-partner collision: the number found most plausibly
  belongs to the village office or the visiting monitoring officer who posted about the group, not
  the group itself — logged in the audit trail as found-but-unconfirmed rather than either written
  as real or silently dropped. **All 19 attempts logged** in `contact_tier_c_attempted_at`/
  `contact_tier_c_attempt_result` regardless of outcome, including the 2 right-place-wrong-holder
  cases and 1 flagged as a probable raw-data-quality issue (`Wagi Bandung Kayungyun` — zero real
  web presence found under this exact name at all). Patched surgically (same two-target pattern as
  the Tier B audit-trail round): both `exported_output_stage3/candidate_details.json` (the source
  of truth for a future reseed) and the live `gluribridge.db`'s `detail_json` blobs directly,
  verified via a real diff (exactly 19 candidates' `contact` sub-objects touched, nothing else) and
  SHA-256-backed-up originals before writing. **Caught the known uvicorn stale-code gotcha again**:
  the running server predated this same day's earlier `has_phone`/`contact_tier_c_attempted`
  `db.py` change, so a live check correctly showed those keys missing from `/candidates` until an
  actual restart — confirmed present immediately after. All 15 backend tests still pass.
  **Incidental discovery worth a future round**: `simluh.bp2sdm.kehutanan.go.id`, the Ministry of
  Forestry's own official KTH registry portal (filterable by province/kabupaten), surfaced
  repeatedly during this search but never for the right district — a more targeted, authoritative
  source worth querying directly next time rather than free-text search; not verified to expose
  per-KTH phone numbers, just flagged as the right kind of source to check.
- **Investigated whether `Direktorat Konservasi Ekosistem2` (a government ministry directorate
  appearing as a candidate registrant, flagged during the Tier C round above) is an isolated
  data-quality artifact or a broader pattern** (2026-09-01) — checked deliberately with the real,
  already-present raw `executor.name` field (`Dunia Usaha` | `Komunitas` | `NGO` |
  `Institusi/Lembaga` | `Pemerintah Daerah` | `Mitra Pembangunan` | `Pemerintah Pusat`), not
  keyword-guessing on the org name (a keyword pass alone both under- and over-counted: it missed
  `RSUD Dr. Soetomo`/`Dinas Lingkungan Hidup...` entries that don't contain an obvious agency
  word, and it wrongly flagged two legitimate `UPT Pengelola Kawasan Hutan, Universitas Brawijaya`
  registrants — a university's own forest-management unit, a real and appropriate registrant type,
  not an anomaly). Real finding: **14 of the 283 raw SRUK/SRN-PPI records have an explicit
  government executor type** (2 `Pemerintah Pusat`, 12 `Pemerintah Daerah` — mostly genuine,
  correctly-typed registrants for their kind: village governments for Hutan Desa-style schemes,
  regency/city environmental agencies, one regional public hospital), confirmed directly against
  the raw files, not estimated. Of those 14, **only 1 survived into the final 144-candidate list**
  — `Direktorat Konservasi Ekosistem2` itself; the other 13 were independently filtered out earlier
  in the pipeline for unrelated reasons (confirmed one, `Desa Lawe Sempilang`, genuinely has FOLU
  as one of its sectors and still didn't make it through, so sector filtering alone doesn't fully
  explain the other exclusions — not traced further, out of scope for this question). **Verdict:
  not a systemic leak** letting government bodies through en masse — this specific case slipping
  through looks incidental, not a pattern the pipeline is failing to catch. **Real, currently-unused
  gap worth a future field, not an urgent fix**: `executor.name` is present on every raw record and
  never mapped into `UnifiedCandidateRecord` or used anywhere downstream — nothing today can
  distinguish "a government body, a fundamentally different kind of outreach target" from a normal
  community/company candidate at either scoring or contact-resolution time. Recommend exposing it
  (e.g. a `registrant_type` field) if/when this population grows, rather than building it now for
  one known case. **Secondary, smaller finding, same investigation**: `PT.WANARIMBA`'s registrant
  *contact name* (not its org field) is `Kesatuan Pengelolaan Hutan Kulawi` — a real government
  Forest Management Unit (KPH) name sitting in the person-name slot of an otherwise normally-named
  private company — a different shape of the same underlying "a government entity's name where an
  individual's was expected" oddity, flagged for awareness, not investigated further.
- **A full plain-language terminology pass across the whole frontend** (2026-09-02) — an explicit
  ~62-item mapping table reviewed and approved by the user before applying, not invented
  unilaterally. Every glance-level label (KPI cards, badges, chips, table headers, filter
  options, tooltips) swaps the internal/technical term for plain business language, with the
  technical term kept reachable via a native `title` tooltip; already-detail contexts
  (`HowItWorksPage.tsx`'s body prose, `SourceBadge`'s space-constrained inline registry tags, the
  candidate-detail registry-ID reference row) deliberately keep the technical term primary since
  it adds credibility there, not demoted. Key renames: Need score → Opportunity, Credibility
  score → Evidence Strength, Fact → Confirmed (**not** Verified — Confirmed means read directly
  from a registry field, Verified means independently cross-checked; this distinction is
  load-bearing for the app's credibility claim and resurfaced explicitly again during the Korean
  translation work below), Hypothesis → Inferred, Contactability → Contact Found, Geospatial →
  Location Verified, Unclassified → Needs Classification, Not Applicable → Not Relevant, the
  score_label category `confirmed` → "Verified Project" (renamed specifically to avoid colliding
  with the new Fact → Confirmed evidence tag — two different real concepts that happen to share
  an English word, never rendered in the same place), `mixed` → "Balanced" (neutral description,
  not "Needs Review" — mixed isn't a problem requiring attention), BRWA Overlap → Customary
  Territory Overlap. Indonesian/registry acronyms (SRUK, SRN-PPI, Verra, BRWA, DRAM, DPP,
  Permenhut 6/2026, PBPH, perhutanan sosial, hutan adat, hutan hak) get plain English names with
  the original term kept visible in parens or a tooltip, never fully replaced. Added three new
  `Record<string,string>` label maps to `lib/format.ts` (`LAND_RIGHTS_CATEGORY_LABEL`,
  `VERIFICATION_STATUS_LABEL`, `RICHNESS_DISPLAY_LABEL`) following the same pattern as the
  existing `POLICY_TIER_LABEL`/`MATCH_STATUS_LABEL`, for the two fields that render raw API enum
  values directly. Caught one real leftover during verification not in the original table: a raw
  `need X / cred X` inline stat on `ScoreLabelPill` (Dashboard top-5 lists and candidate rows).
  Verified: tsc clean, 0 console errors/overflow across every page at 1280/1440/1600px, real
  screenshots reviewed.
- **The Dashboard's visual direction pivoted a second time, superseding the "field instrument"
  look logged above** (2026-09-02/03) — the flat/hairline/no-shadow/sharp-corner direction from
  2026-08-31 was itself replaced, at the user's explicit request after reviewing a reference
  mockup, with a rounded, soft-shadow, icon-badge look closer to a polished product than a survey
  clipboard. The lever was small and app-wide: `.instrument-panel`'s own CSS definition changed
  from `border-radius: 2px; box-shadow: none` to `border-radius: 1rem` plus a soft warm-toned
  shadow — since nearly every `Panel`/`KpiCard`/`ScoreStatCard` usage across the whole app already
  opts into that one class, this single definition change rolled the new look out everywhere in
  one step, no per-call-site edits needed. Also dropped `KpiCard`'s instrument-only
  readout-underline/wide-tracking treatment (the "telemetry display" texture that belonged to the
  superseded direction). Dashboard-specific additions built on top of that lever: the "Contact
  ready"/"Also found" inline-sentence rows were rebuilt as two icon-circle cards with a big number
  and pill-chip breakdown (same 5 real numbers, same real filtered links, same honest separation
  between email-readiness and merely-found-a-phone); `ScoreStatCard`'s "just the number" usage
  (the candidate-profile gallery) gained a differentiated visual per axis — a filled progress bar
  for Opportunity, a 5-dot scale for Evidence Strength (dot count = value/20 rounded, still a real
  number); a new `DonutChart` component (plain SVG, no chart library) replaced Data richness's 3
  bar rows with a donut+legend, a genuine 3-way split a donut communicates well. **Outreach
  status tried the same donut treatment and reverted it** — real data is 141/144 "not contacted"
  right now, so the ring rendered as one near-solid color with the other 4 categories as
  invisible slivers; reverted to a plain dot+count list instead, which is more honest at this
  skew than either a donut or a bar. **A real overflow bug was caught during verification**: the
  first donut+legend layout pushed legend text past the card edge on both panels — missing
  `min-w-0` on the flex legend container, the same overflow trap `Panel.tsx`'s own code comment
  already documents; fixed with `min-w-0` + `truncate` + a smaller donut. Verified: tsc clean, 0
  console errors/overflow across every page at 3 widths.
- **"Data richness" was replaced with "Candidates by project type" on the Dashboard** (2026-09-03,
  a mentor's suggestion at the hackathon) — real, already-tracked `activity_categories` field
  (Peatland, Reforestation, Social forestry, Conservation, Improved Forest Management), not a new
  taxonomy invented for the panel. Chose to replace Data richness rather than Candidates by
  province: richness (rich/corroborated/thin) is largely redundant with Evidence Strength, already
  shown in the KPI row, the Top 5 list, and every candidate card; province is the only geographic
  breakdown on the page. Deliberately a bar list, not a donut, unlike the sibling panels above — a
  candidate can carry more than one real category (`activity_categories` is a list), so the rows
  sum to more than the candidate total (159 category-tags across 144 candidates at time of
  writing) and a donut ring would misrepresent that as a whole being sliced; the panel's own
  caption says so explicitly. Also surfaces the real Unclassified count (48/144, 33%) honestly
  rather than hiding it. Real distribution at time of writing: Reforestation 55, Unclassified 48,
  Social forestry 33, Conservation 31, Peatland 29, Improved Forest Management 11, Not applicable
  1.
- **An EN/KO language toggle was added, deliberately scoped to the nav/header chrome plus the
  Dashboard page only** (2026-09-03) — for Demo Day, given real users are the client's own
  2-person Korean team and competitors in this space ship Korean-language products, but with only
  2 days left and the immediate goal being to impress judges in a walkthrough, not a full
  production i18n pass. Every other page (Candidates list, Candidate detail, Territory Discovery,
  How it works) stays English, unaffected. Mechanism: `lib/LanguageContext.tsx` (React context +
  localStorage-persisted state) and `lib/i18n.ts` (a plain `key -> {en, ko}` dictionary + `t()`/
  `useT()`, no library dependency given the moderate string count — a missing key falls back to
  English rather than blanking or crashing). The load-bearing architectural choice: shared
  components used both on and off the Dashboard (`ScoreLabelPill`, `ProvinceBreakdown`,
  `ProjectTypeBreakdown`, `DashboardMap`) take an opt-in `lang` prop defaulting to `"en"` — every
  non-Dashboard call site is completely unaffected since it never passes the prop; confirmed live
  by toggling to KO and navigating to Candidates, which stayed fully English. Added Noto Sans
  KR/Noto Serif KR as font-stack fallbacks (Fraunces/Inter/IBM Plex Mono have zero Hangul glyph
  coverage) — falls through per-character automatically, English text untouched. **A real
  domain-appropriateness correction, caught by the user mid-implementation, not part of the
  original plan**: "candidates" in this app means forestry-carbon projects/organizations, never
  people, but the direct Korean word for "candidate" (후보) strongly implies a *human* candidate
  (job/election) — replaced with 프로젝트 ("project") throughout after a first pass at 후보지
  ("candidate site") was itself revised following native-level review (see below), including
  fixing a counter-word bug (used 명, the counter for people, instead of a correct one). Separately,
  the 5 `activity_categories` values are a real Indonesian forestry/carbon-registry classification,
  not a generic descriptive category — kept the recognizable English/international term visible in
  parens (e.g. "재조림 (Reforestation)", "산림경영 개선 (IFM)") rather than fully replacing it with
  invented Korean vocabulary neither Claude nor, as it turned out, a subsequent native-level review
  could agree on with confidence (the review's own suggested term for "Social forestry", 사회임업,
  differed from the draft's 사회림 — two different words from two different sources for the same
  real regulatory category was itself treated as evidence the term isn't settled, not resolved by
  picking one). The Confirmed-vs-Verified distinction from the terminology pass above was kept
  consistent in Korean too (검증된 = Verified, 확인된 = Confirmed) after a review pass caught one
  chip that had drifted to the wrong word. Korean copy throughout is a draft written by Claude,
  revised once against native-level review feedback, but explicitly NOT presented as a
  native-speaker-signed-off translation — `i18n.ts`'s own header comment says so. Verified: tsc
  clean, 0 console errors/overflow across every page at 3 widths, language persists across a
  reload, confirmed Korean does not leak onto out-of-scope pages.
- **A cold-open landing page now exists at "/", with the actual app moved to "/dashboard"**
  (2026-09-03) — built for someone opening the deployed link with no narration (the live demo
  walkthrough starts directly at `/dashboard`, unaffected). Deliberately terse: one headline, one
  sentence, three real proof-point numbers, one primary CTA ("View dashboard"), two small
  secondary links (How this works, Design system) — nothing that takes longer than about 10
  seconds to read, no feature list, no testimonials. Renders standalone with no sidebar/header
  chrome (a real front door, not just another app view); every other existing route is otherwise
  unchanged except the path move. All three proof-point numbers come from the same live
  `CandidatesProvider` fetch as the rest of the app (moved up one level in `App.tsx` to wrap the
  landing page too, so it's one real request, never a duplicate): total real candidates (144),
  two independent scores as real counts (30 high-opportunity, 4 high-evidence — not a hardcoded
  "two scores" claim), and an explicitly honest contact figure — direct contacts (a real email on
  file, any confidence level, 16) shown separately from the larger named-only bucket (a registrant
  name but no email, 86), never collapsed into one inflated total, per explicit instruction and
  the same non-blending discipline the Dashboard's own Contact ready / Also found split already
  established. Visual direction matches the app's current (rounded/soft-shadow) look exactly,
  reusing `KpiCard` verbatim for the three proof points rather than inventing a new stat shape —
  the task's own brief described the OLD flat/hairline direction this session had already moved
  away from, flagged explicitly rather than built either way silently. A subsequent native-level
  design review largely endorsed the result but suggested inflating the "16" figure to look more
  impressive; not applied — that would directly undo the explicit non-inflation instruction the
  page was built against. Made the sidebar's GluriBridge brand mark a real link back to "/" (it
  wasn't a link before this page existed). Verified: tsc clean, 0 console errors/overflow across
  all 7 routes at 3 widths, clicked every nav link, the CTA, and the logo link to confirm real
  navigation.
- **The real GluriBridge logo replaced the placeholder dot+text brand mark, and a proper favicon
  was generated** (2026-09-03) — the source file (`GluriBridgeLogo.png`, provided at the repo
  root, 1408x768, opaque white background despite RGBA mode) was moved into
  `frontend-react/src/assets/` (a frontend brand asset, not something that belongs loose at the
  repo root), chroma-keyed from white to transparency with a soft alpha ramp at the ink edges (not
  a hard cutout), and cropped to its real content bounding box. A white-ink variant was generated
  separately for the dark `forest-950` sidebar specifically, after compositing a preview showed
  the original green ink reads weakly there — the green original is used only on light
  backgrounds (the landing page header), where it reads cleanly; its green is already close to the
  app's own `forest-700` token. The actual provided artwork was kept rather than generating a
  replacement — a well-designed, on-brand mark, and substituting a generated logo for a real
  provided asset was treated as a bigger creative call than "prepare a favicon" implied, flagged
  explicitly rather than decided unilaterally. Favicon: `favicon.ico` (16/32/48px, transparent),
  standalone 16x16/32x32/192x192 PNGs, and a white-background 180x180 `apple-touch-icon` (iOS
  renders transparent touch icons as black in several contexts) — checked actual pixel-level
  legibility at 16px and 32px before finalizing (a real concern for a detailed multi-tree mark):
  32px reads clearly, 16px softens into a recognizable green arch shape, consistent with how most
  detailed logos behave at that size. Replaced the default Vite placeholder icon in `index.html`
  (confirmed no other references to it first). Verified: tsc clean, all 5 favicon link tags
  resolve 200, real screenshots reviewed (header, sidebar, and the raw 16px/32px favicon pixels).
- **A real Sync/Registry feature now exists** (2026-09-03/04), replacing an external proposal's
  recommendation of a fake "Demo Sync mode" (simulated progress, reports success regardless of
  reality, tell judges it's live) — refused outright: fabricating results and presenting them to
  evaluators as real directly contradicts the app's own pitch (real, evidence-backed, nothing
  fabricated). Built the real thing instead. Backend: `TAVILY_API_KEY`/`NVIDIA_API_KEY` now load
  from a repo-root `.env` via `python-dotenv` (`app/main.py` calls `load_dotenv()` before any
  sibling import reads an env var; a pre-existing `.env.example` was already in the repo but
  invisible to `git status` because the old `.gitignore`'s `.env.*` pattern was also silently
  swallowing it — fixed with `!.env.example` negations). A new `refresh_log` SQLite table
  (`app/db.py`) persists every refresh attempt (started/finished, status, `with_news`/`used_news`,
  `triggered_by`, detail). `POST /refresh` runs as a real `BackgroundTasks` fire-and-forget job
  (`app/scheduler.py`'s `run_refresh_cycle()`), with a module-level `_current_refresh` dict giving
  live per-source phase/status (`GET /refresh-status`) that the frontend polls every 1.5s — a real
  concurrency guard rejects a second refresh while one is in progress (409) and a frozen dataset
  rejects any refresh at all (423). `only=<source>` restricts a refresh to exactly one registry
  source (always runs regardless of cadence, the other three immediately marked "skipped" not left
  "pending" — honest about what was never going to run this cycle); `with_news` is ignored when
  `only` is set, since news is a pipeline-wide step, not scoped to one registry. New
  `SyncPage.tsx` (`/sync`) replaces any need to run `orchestrate.py` by hand from a terminal:
  live Sources table (per-source last-fetched/age/status + individual Refresh buttons, BRWA's
  visually distinct — amber, explicit tooltip — since it's a genuinely heavier operation, 2,283
  profiles + PDFs), a "Refresh registries" / "Refresh with live news" pair of buttons, and the
  real recent-attempts log from `GET /refresh-log`. The dataset-staleness banner (amber, shown
  when `last_registry_refresh` and `last_full_refresh_with_news` have diverged — see Open Item #5
  below) was moved from every page (`App.tsx`'s shell) to render only on this page, per explicit
  request — it's actionable information for whoever runs a refresh, not a page-wide interruption.
  **One real React bug found and fixed**: a StrictMode dev double-invoke of a cleanup-only
  `useEffect` permanently poisoned a `cancelledRef` flag before the real mount's async work could
  resolve, leaving the page stuck on "Loading…" — fixed by resetting the flag at the top of the
  *same* effect that does the async work, not a separate cleanup-only effect. **A second real bug
  found and fixed**: the background scheduler's automatic hourly tick called the synchronous,
  potentially many-minutes-long `run_refresh_cycle()` directly from an `asyncio` task instead of
  via an executor, blocking every endpoint on the entire server for the full duration of any
  automatic refresh — fixed with `asyncio.to_thread()`. Verified live: tsc clean, all 15 backend
  tests pass, a full Playwright sweep, `only=sruk` correctly 423s while frozen without touching
  anything, `only=<invalid>` correctly 400s, BRWA's amber styling confirmed distinct.
- **Three real data-loss incidents happened live during the Sync feature's build and use, all
  root-caused to the same underlying, already-documented design property** (Open Item #5:
  registry-only refresh legitimately produces fewer candidates than the last rich/news-enriched
  one, since news-discovered "thin" candidates only ever exist after a Tavily-enriched run) —
  combined, each time, with insufficient protection at that moment:
  1. Two concurrent manual refresh clicks raced before the concurrency guard above existed
     (144→129) — recovered via `git checkout -- backend/exported_output_stage3/` (HEAD still had
     144) + a DB reload.
  2. A user-requested "stop" killed a scraper subprocess mid-run; the *existing*
     graceful-degradation logic (correctly designed for a genuine source *failure*) treated the
     kill exactly like an ordinary failure and completed a full registry-only reload anyway
     (144→130) — recovered the same way. Surfaced, not yet built: a real
     `POST /refresh/cancel` that distinguishes an explicit user cancellation (should abort before
     ever touching the DB) from an ordinary source failure (should degrade gracefully, as
     designed) — proposed, not built, since it wasn't confirmed before other work took priority.
  3. **Unrecoverable, unlike the two above**: a genuine rich refresh (with real live news) 
     completed successfully at 09:45:50 UTC but was never frozen immediately afterward — the
     scheduler's own normal hourly auto-tick then fired 3 times over ~2.5 hours, each downgrading
     the dataset further, ending at 124 candidates with no git backup of the 09:45 state (unlike
     incidents 1 and 2, where a git-committed 144 always existed to restore from). Explicitly
     owned rather than hedged: freezing immediately on completion is safe and reversible and
     should never have waited on anything. Fix for every refresh since: a standalone bash script,
     launched independently in the background, polls `GET /refresh-status` every 20s and calls
     `orchestrate.write_freeze()` the INSTANT completion is detected (a `SEEN_RUNNING` guard avoids
     racing the background task's own startup, since a `null` status only means "genuinely
     finished" after `in_progress:true` was observed at least once first) — deliberately not
     relying solely on being re-invoked promptly, since a scheduled 25-minute check-in once did
     not fire in time (214 minutes elapsed instead) with no definitive root cause found for why.
- **A real Verra data-completeness bug was found, root-caused, and fixed** (2026-09-04) — a
  144→137 candidate drop looked at first like ordinary run-to-run variance (both Verra's project
  list and live Tavily news search are real, moving targets), but checking Verra's own crawl logs
  directly (rather than accepting that explanation) showed the real cause: Verra's API
  rate-limited 203 of 1976 project fetches (`Retryable status 429`) during that day's registry
  scrape — confirmed against the crawler's own `meta.json` (`fail_rate 10.3%`, explicitly exceeding
  its own 5% alert threshold) versus the prior good run (0% failed). Not a real registry change —
  a scraping completeness gap. Fixed by retrying just those 203 IDs directly
  (`verra_crawler.py --ids <file>`, a pre-existing but previously-unused flag) at a gentler pace
  (2 workers instead of 4) once the rate-limit window had reset (~3 hours later) — 202 of 203
  recovered; the one remaining failure (project 3562) is a genuine empty/invalid API response,
  unrelated to rate limiting. Merged the recovered project files into the existing run folder
  (the pipeline reads Verra data by globbing `runs/<date>/projects/*.json` on disk, never from
  `meta.json`'s own counts, so no other code needed to change) and rebuilt the full rich pipeline
  against the corrected data: 147 candidates, verified consistent across the live DB,
  `refresh_log`, and `ranked_candidates.json`'s row count. **One real mistake made and disclosed
  during this same recovery**: an intermediate one-off rebuild script forgot that only
  `app/main.py` calls `load_dotenv()` — bypassing it left `TAVILY_API_KEY` invisible to that
  script, so `with_news=True` silently had no effect and produced an incorrect, uncommitted
  130-candidate registry-only result; caught immediately via `/stats` and `/refresh-log` before it
  was ever committed or pushed, and superseded by the corrected rerun.
- **A second, independent real data-loss bug was found and fixed the same day**: real Tier C
  phone/WhatsApp + public-presence data (18 phone numbers, 15 website/Facebook/Instagram links,
  hand-verified against real pages across an 86-candidate manual round on 2026-09-01) was being
  silently erased on every subsequent pipeline rebuild, because the *existing* Tier B email
  preservation mechanism (`preserve_contacts_by_registry_key`, added 2026-08-31 for exactly this
  class of problem) had two real gaps that meant it never actually covered the phone/presence
  fields added the very next day: (1) `orchestrate.py`'s gate checked only email's
  `contact_source`, so a candidate with a real phone but no email at all was excluded from
  protection from the start; (2) even a matched candidate's restored `RegistrantContact` was
  reconstructed with only `name`/`org`/`email`/`contact_source`/`contact_source_url`/
  `contact_confidence` — silently dropping every phone/website/facebook/instagram field, since
  those didn't exist yet when that reconstruction code was first written; (3) the restore was also
  all-or-nothing per candidate, so a fresh (even lower-confidence) Tier B email hit in a given run
  would block phone/presence restoration too, despite no automated step in this pipeline ever
  being able to produce a genuinely fresh phone/presence source (Tier C remains manual-only) to
  legitimately shadow it. Fixed all three: a new `contact_has_preservable_data()` helper
  (`pipeline.py`) checks email/phone/presence independently and is now the single shared gate both
  modules use, and email vs. phone vs. presence restoration are three separate decisions instead
  of one. Recovered the lost data by temporarily reinstating the last export that still had it
  (git commit `2fec13c`) as the "prior export" the preservation step reads, then rebuilding — the
  fix restored exactly the original 18 phones + 15 presence links, verified by exact count match.
  All 15 backend tests still pass. Final count: 149 candidates, 10 high-confidence emails (up from
  8 in the immediately-prior, still-incomplete rebuild). **Noted but not fixed**: a fresh, *lower*-
  confidence Tier B email can still silently replace a better preserved one in a future run — a
  separate, pre-existing design tradeoff (fresh always wins over preserved) unrelated to what
  actually broke here, flagged to the user rather than changed without being asked.
- **A real gap between what's committed and what a fresh Render deploy can show was found and
  fixed** (2026-09-04) — the Sync page's Sources table showed SRUK/SRN-PPI/Verra as "Never
  fetched" on the live deployed site even though the actual candidate data (correctly seeded from
  the tracked `exported_output_stage3/`) was genuinely fresh. Root cause: `orchestrate.py`'s
  per-source freshness readers (`_freshness_sruk`/`_freshness_srn_ppi`/`_freshness_verra`) read
  `fetched_at` straight from small files living inside the otherwise-excluded (too large, ~11GB)
  `backend/data/raw/` — none of which ever reached GitHub, so every reader correctly reported "no
  file on file yet" on a fresh deploy. Same category of issue as the `brwa_profiles/wa_list.json`
  fix from 2026-08-31 — the candidate data itself was never wrong, only a small metadata file the
  live app needs was missing. Fixed the same way: un-ignored just the four small files these
  specific functions actually read (`sruk/project_list/all_projects.json` 82KB,
  `srn_ppi/project_list/all_projects.json` 158KB, `verra/latest.txt` 10 bytes,
  `verra/runs/<date>/meta.json` 28KB — ~268KB total), not the bulky per-project raw dumps they sit
  alongside, which stay excluded. BRWA was unaffected (already fixed the same way in 2026-08-31).
- **Candidate count evolution, for anyone reconciling a number against an earlier snapshot of
  this document**: 144 (2026-08-28 initial commit) → 137 (2026-09-03, a real refresh whose Verra
  input was incomplete due to the rate-limiting bug above, not yet known at the time) → 147
  (2026-09-04, after the Verra fix) → **149** (2026-09-04, current — after the Tier C
  preservation fix also restored 42 preserved contacts, up from 11). Every one of these is a real
  number from an actual pipeline run, not a target being chased back to a prior value — both
  Verra's own registry and live Tavily news search are real, moving inputs, so today's correct
  number was never guaranteed to equal any prior day's.
- **Open item found this round, not yet resolved**: the deployed Render frontend build appeared
  to take several minutes instead of its usual ~20 seconds. `npm install` (not `vite build`,
  confirmed fast — ~7s locally for a clean build) was the actual bottleneck, and Render's own log
  showed `Using Node.js version 24.14.1 (default)` — this project has no `.nvmrc`/`engines` pin, so
  Render uses whatever its own current default is, which can silently change and invalidate any
  build cache when it does. A `.nvmrc` pinning Node 18 (what this project actually develops/tests
  against) was proposed as the fix but not yet applied — pending confirmation.
- **The outreach email's opening was rewritten** (2026-09-04) — a real, user-caught flaw: it used
  to open by directly quoting dossier.py's raw `why_gluri` reason text (e.g. "Reached
  technical/validation stage with neither a DRAM nor a DPP on file. No technical/monitoring
  documentation submitted to any registry...") for every reason that fired, in order — accurate,
  but reads like an audit finding recited back at the recipient, not a professional introduction.
  New body shape: greeting, one sentence of who Gluri is + why reaching out (`COMPANY_INTRO_*`,
  condensed to a real single sentence from its previous two), ONE recipient-facing context
  sentence, the existing 4-6 week MRV baseline offer (unchanged), the existing 2-3 discovery
  questions (unchanged), soft close. The context sentence is selected — not re-derived — from a
  small fixed `CONTEXT_SENTENCES` table (`outreach.py`) keyed by which single real scoring.py rule
  (N1-N6) has top priority among whichever reasons actually fired for this candidate
  (`CONTEXT_PRIORITY = [N4, N1, N2, N3, N5, N6, FALLBACK_THIN, FALLBACK_CLEAN]` — N4, a real public
  mention of an active partner search, ranked above the far more common N1/N2 registration-stage
  reasons since it's the most directly relevant thing to lead with when it's real; N6, a
  compliance-deadline signal, ranked last since quoting specific regulatory urgency is the wrong
  register for a first-contact email even reframed), reframing the SAME real underlying fact as
  context rather than a deficiency report (the exact example this rewrite was requested against:
  N1's "neither a DRAM nor a DPP on file" becomes "we understand your project is moving through
  the registration and validation process" — real fact, different framing). The fact/hypothesis
  hedge mechanism is unchanged and still applies to this one sentence exactly as it did to the old
  multi-sentence opening: stated plainly if the selected reason's evidence_level is "fact", wrapped
  in the existing `HEDGE_PREFIX_EN`/`_ID` ("it appears that"/"tampaknya") if "hypothesis" —
  verified on a real candidate with both a hypothesis-tagged reason (N4, artificially attached news
  evidence, matching this session's own established test pattern) and several fact-tagged ones
  present simultaneously: the hypothesis one was correctly selected and hedged, the fact ones
  correctly NOT surfaced (by design — one sentence now, not every reason). The detailed gap
  analysis itself is completely unchanged and unshortened — `dossier.py`'s `why_gluri` still
  carries every real reason, unaffected; it's read on the candidate detail page for Gluri's own
  internal use, never sent to the recipient. One small, purely additive schema change was needed to
  avoid duplicating scoring.py's rule logic a second time in outreach.py: `dossier.py`'s `why_gluri`
  entries (and its two synthetic no-reasons-fired fallback cases, tagged `FALLBACK_THIN`/
  `FALLBACK_CLEAN`) now also carry the already-computed `rule` tag through unchanged — nothing
  about what's computed or shown on the detail page changed, this only exposes an existing field
  to a new consumer.
  **Investigated before touching anything, per explicit instruction**: an outside reviewer's claim
  that the Indonesian version is "only half-translated" was checked against the actual current code
  (not assumed either way) — confirmed to be case (b), the already-documented, deliberate scope
  boundary from when bilingual output was first built: only `outreach.py`'s own fixed strings ever
  had real Indonesian twins; `dossier.py` has zero Indonesian output anywhere in the system (grepped
  directly — confirmed no `lang` parameter, no Indonesian string literals, only the English word
  "Indonesia/Indonesian" appearing inside otherwise-English sentences). Nothing regressed. This
  rewrite incidentally makes the Indonesian version more complete, as a side effect: the old
  opening paragraph's claim text (English-only, straight from `why_gluri`) is gone from the
  Indonesian section, replaced by the new context sentence, which now has a REAL Indonesian twin
  (`CONTEXT_SENTENCES`, written here, not LLM-generated) — the only English-only dynamic content
  remaining in the Indonesian half of an email is now just the MRV-baseline pitch sentence and the
  discovery-question text itself (the lead-in sentence above them is already Indonesian), strictly
  less than before. Verified: all 15 backend tests pass, including `test_outreach.py`'s hedge-
  preservation assertions rewritten to match the new one-sentence design (one case proves a
  hypothesis-tagged context sentence is hedged and a fact-tagged one is NOT surfaced in the same
  email; a second, folded into the existing West Seram case, proves a fact-tagged context sentence
  is stated plainly, unhedged, in both languages, using the real DRAM/DPP-absence example).
- **Thin (news-only) candidates now persist across runs instead of silently disappearing —
  caught by the user asking a genuinely good question**: "shouldn't the count only grow, not
  shrink, once something's been discovered?" It doesn't, and the honest answer is architectural,
  not a bug being fixed on the margins: `run_pipeline()` recomputes the ENTIRE candidate list from
  scratch on every call. A registry-sourced candidate stays rediscoverable indefinitely because its
  underlying registry listing still exists to be re-parsed; a thin candidate has NO registry_ids at
  all — it only ever existed because a past run's independent live Tavily search happened to
  surface it. If a later run's own search doesn't happen to re-surface the same article, that thin
  candidate was never being tracked anywhere to begin with, so it just doesn't get recreated —
  confirmed precisely by diffing two real committed exports: the registry-sourced ("rich") count
  was byte-identical (130 in both), and the entire 149->143 swing that prompted the question was
  100% the thin population (19->13).
  Fixed with the same "carry forward from the prior export" pattern already used for Tier B/C
  contacts, extended to whole candidate records this time: `orchestrate.py`'s new
  `_read_prior_thin_candidates()` reconstructs every `data_richness='thin'` candidate from the
  export about to be overwritten (deliberately scoped to thin candidates ONLY, not a general
  deserializer — their real shape is capped: name/org/country, no documents, no carbon tracks, no
  BRWA evidence, confirmed against real exported thin candidates before writing this) and
  `run_pipeline()` gained a `prior_thin_candidates` param, seeded into the SAME matching pool a
  hit created earlier in the same run can already be corroborated against — so a prior thin
  candidate re-surfaced this round gets genuine new evidence added in place (never duplicated),
  and one NOT re-surfaced is carried forward completely unchanged rather than silently vanishing.
  Passed unconditionally, not gated on `with_news` — this is exactly what now also protects a
  registry-only run (including the background scheduler's own automatic hourly tick, which never
  passes `with_news=True`) from the same silent-drop behavior that caused three separate incidents
  earlier this session. `pipeline_stats.json` gained `news_thin_candidates_carried_forward`,
  tracked separately from `news_thin_candidates_created` so the latter keeps meaning "genuinely new
  this run," not inflated by carried-forward ones. A useful side effect noted, not separately
  fixed: since the WHOLE thin-candidate record is now carried forward (not just its contact via
  registry_ids, which thin candidates never have), this actually covers Tier B/C contact
  preservation for thin candidates too — a gap the registry-id-keyed mechanism could never reach.
  Verified via a new, fully offline test (`test_thin_candidate_persistence.py`, no live Tavily
  calls, same discipline as `test_news_matching.py`) proving all three real scenarios end to end:
  a thin candidate NOT re-mentioned in a later run's search is carried forward unchanged; a
  genuinely new one is still created fresh in the same run; a re-surfaced one is corroborated in
  place (real new evidence added) and never duplicated into a second record. All 16 backend tests
  pass (15 + this new one).
