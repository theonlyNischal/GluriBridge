# GluriBridge — Project Context

Read this fully before touching any code. This is the entire "why" behind decisions that
otherwise look arbitrary in the code itself.

**This version reflects the state AFTER a full local verification pass (VS Code / Claude Code),
not the state at initial handoff.** Section 7 in particular changed materially — read it even
if you've seen an earlier version of this document.

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
  countries) are admissible if genuinely stronger. **Not built** — the current country filter
  (Section 6/7) restricts to Indonesia only; expanding it needs deliberate design, not just
  loosening the filter, or non-Indonesian noise floods back in (see the country-filter bug below).

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
| BRWA | Badan Registrasi Wilayah Adat — Indonesia's customary/indigenous territory registry (NGO-run, 2283 territories total). Two independent axes per territory: `policy_tier` (`penetapan` = a specific government determination, strongest; `pengaturan` = general regional regulation, weaker; `belum_ada` = no policy doc) and `verification_maturity` (`early`/`mid`/`advanced`, BRWA's own internal process). **`policy_tier` comes from BRWA's own list-level classification (`wa_list.json`), not from guessing at document text.** |
| Permenhut 6/2026 | The regulation governing forest-carbon trading. **25 rules encoded** (R001-R025) in `data/regulatory/regulatory_rules.json`. As of this writing, **4 are wired into scoring** (see Section 7) — the rest are individually justified as not-yet-evaluable, not silently skipped. |

## 4. Architecture — what actually happens, in order

```
SRUK/SRN-PPI scrapers ─┐
Verra scraper          ─┼─▶ per-source normalizer ─▶ COUNTRY FILTER (Indonesia only) ─▶
BRWA list + geometry    ┘                                                              │
Tavily news search ──▶ discovery signal only                                          ▼
                                                              UNIFIED CANDIDATE RECORD ◀── identity resolution
                                                              (same schema for every      (fuzzy org/name/desc/geo
                                                               source)                     match + PROVINCE PRE-FILTER,
                          │                                                                conflict detection)
                          ▼
              attach BRWA evidence (spatial, not identity — a customary
              territory is a fact about a PLACE, never its own candidate)
                          │
                          ▼
              score: need_score (gap/opportunity) + credibility_score
              (maturity/confirmation) — DELIBERATELY SEPARATE, not blended.
              Compliance badge (Permenhut rules, real file, NOT hardcoded)
              feeds into need_score as a small urgency signal, but the raw
              badge always stays separately visible too.
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

**The country filter and the province pre-filter (both added during local verification, see
Section 6) are now load-bearing parts of this pipeline, not optional hardening** — without them,
~97% of Verra input is non-Indonesian noise that floods both the candidate list and the
identity-resolution tentative-review queue into unusable territory.

## 5. Design principles — the "why" behind things that look like extra complexity

- **Fact vs. hypothesis, everywhere.** Every rule that contributes to a score tags itself
  `evidence_level: "fact"` or `"hypothesis"`. Direct requirement from Gluri's own answer — don't
  collapse it into a plain sentence anywhere.
- **No LLM for scoring or normalization.** Deterministic, auditable, reproducible, cheap to
  re-run daily. The LLM's only legitimate role is turning already-computed facts into readable
  prose or extracting entities from genuinely unstructured text — never deciding a score or match.
- **A blocklist/filter can never be assumed complete — verify, don't extrapolate.** Two separate,
  real instances of this exact lesson: (1) `contact_resolution.py`'s Tier B originally trusted a
  domain-name fuzzy match until an adversarial test proved a coincidental match plus an unrelated
  email could slip through — fixed with content-based self-identification checks. (2)
  `pipeline.py` had NO country filter at all until local verification checked real Verra volume
  and found 97.6% of "Indonesian forestry candidates" were actually from India, China, Brazil,
  PNG, Zambia, and dozens of other countries — every test during original development used a
  hand-picked list of ~13 known-Indonesian Verra IDs, so the missing filter was invisible until
  real, unfiltered data hit it. **Small hand-picked test sets can hide entire categories of bugs
  that only real data volume exposes — this has now happened twice in this project.**
- **A thin/unverified candidate must never look equivalent to a confirmed one.** `data_richness`
  ('rich'/'corroborated'/'thin') must stay visible in any UI/export — never silently blended away.
- **When a check can't run, say so — don't default to a negative result.** Applies to BRWA
  overlap (no coordinates → "not yet checked," not "no overlap"), compliance (`not_applicable`
  badge), AND the identity-resolution province pre-filter (skip comparison only when BOTH sides
  have a KNOWN, DIFFERING province — never skip on an unknown province, same principle).
- **Verify claims with fresh execution, not restated summaries.** This whole local-verification
  pass started because "I did everything" was treated as a claim requiring proof, not a fact.
  Real bugs (the country filter) and real data losses (the regulatory file silently reverting
  from 25 to 19 rules mid-session) were only caught because every claim was re-run and diffed,
  not accepted at face value. Keep doing this.

## 6. Known real bugs found and fixed (context for why certain code looks defensive)

From original development:
- Two genuinely different SRUK projects by the same org, same boilerplate grant-template
  description text, auto-merged as one candidate until a conflict veto (district + start_date,
  same-schema-sources only) was added.
- A real Verra record had a sign-flipped latitude (+3.09 instead of -3.09); fix flags implausible
  geo distances rather than trusting them.
- `"Multiple Project Proponents"` (a real Verra placeholder) scored as a genuine org mismatch
  until explicitly treated as "not usable."
- SRUK stores province in Indonesian, Verra in English — BRWA matching silently zero-results
  without translation (translation table, `PROVINCE_LOOKUP_ID_TO_EN`, is still incomplete —
  only 3 entries as of last check, see Section 7).
- Verra's `registration_date` arrived as raw Unix epoch-ms in at least one real record.

From local verification (VS Code / Claude Code), more severe, both found only once real data
volume was actually tested rather than the small hand-picked development sample:
- **No country filter existed anywhere in `pipeline.py`.** 97.6% of real Verra forestry-sector
  input (1,929 of 1,976 records) was non-Indonesian. Fixed: Verra input filtered to `country ==
  "ID"` before entering `resolve_candidates()`. SRUK/SRN-PPI independently verified as
  already-100%-Indonesian (all 283 real records checked) — no filter needed there.
- **No province pre-filter existed in `match.py`'s `resolve_candidates()`** (unlike
  `normalize_brwa.py`'s `prefilter_by_admin`, which already did this). Combined with the missing
  country filter, this produced 2,872 tentative identity-resolution links against only 1,761
  final candidates — a review queue larger than the candidate list itself, comparing candidates
  from provinces on different continents. Fixed: skip `match_score()` entirely when both sides
  have a known, differing province (never skip on unknown). Combined effect of both fixes:
  2,872 → 90 tentative links (96.9% reduction), verified by actually running both ways, not
  estimated.
- **The 25-rule `regulatory_rules.json` was silently overwritten by a 19-rule version** at some
  point during a separate scraper task (R020-R025, the DPP-track rules, were missing). Caught by
  explicit filesystem search when asked to verify a suspicious discrepancy, not caught
  proactively when it happened. **16 of the 25 rules' pre-swap wording was never diffed against
  the current file — no backup existed for them.** R016, R006, R003 were confirmed byte-identical
  across the swap (R016 via a preserved original snapshot; R006/R003 via independent
  reconstruction). The other 16 rules' continuity across that swap is permanently unverifiable —
  this is a fact about the project now, not an open task.

## 7. Current state — verified fresh via local execution, not restated from memory

**Compliance rules (`gluribridge/compliance.py`):** reads from `data/regulatory/
regulatory_rules.json` (a real file, no hardcoded constants remain — confirmed by grep).
25 total rules. **4 wired:** R003 (Pasal 6(1), eligible actor category), R006 (Pasal 10, Unit
Karbon precondition), R016 (Pasal 61, transitional filing deadline — the primary badge), R022
(Pasal 20, DPP-track precondition, using `dpp.registration_date`). **21 unwired**, each with a
specific, individually-justified blocker (missing schema field, binds the Ministry not the
candidate, internal process not observable from candidate data, etc.) — not a placeholder list.
**R024 specifically needs a deliberate decision, not just a flag**: it's a 4-part legal test
where only 1 part is proxyable from available data — approximating it risks implying compliance
confidence the data doesn't support; leaving it fully unwired is safe but discards real partial
signal. This tradeoff hasn't been decided either way yet.

**Real pipeline run** (against `data/raw/...`, explicitly not `gluribridge/sample_data/`):

```
sruk_and_srn_ppi_input:  283
verra_input:             1979
skipped_non_forestry:    138
skipped_non_indonesia:   1929
errors:                  0
final_candidate_count:   130
tentative_link_count:    90
brwa_territories:        1756 available / 2283 in full list
```

**Test suite:** all 11 `test_*.py` files pass, fresh execution, exit 0. Two of them
(`test_pipeline.py`, `test_full_pipeline.py`) show a count change (16→15, 17→16) from the country
filter correctly excluding a deliberately-included non-Indonesian test fixture — see the note
below, this is NOT a bug and NOT something to "fix" by removing the fixture.

**Deliberate test fixtures — do not remove:** `gluribridge/sample_data/` contains a real
Brazilian Verra project (Cikel Brazilian Amazon REDD APD Project) plus real China and Tanzania
samples, included on purpose during original development specifically to prove the normalizer's
schema generalizes across countries. Once the country filter was added, these correctly get
excluded from the *pipeline* count — that's the filter working — but they must stay in the test
fixtures themselves. This is documented as a comment in the 5 test files that reference
`verra_ids` (`test_pipeline.py`, `test_full_pipeline.py`, `test_scoring.py`, `test_dossier.py`,
`test_export.py`).

**Still genuinely open, not closed, not hidden:**

1. **`tavily_client.py` has never been tested against a live call, ever, at any point in this
   project.** No API key has been available in any environment this has been built/verified in.
   This is the single most-repeated open item across the entire project — treat it as the first
   thing to verify once a key is available, not an assumption that it works because the code
   looks correct.
2. **Tier C contact resolution (news-mention extraction) doesn't exist.**
3. **`PROVINCE_LOOKUP_ID_TO_EN` still has only 3 entries** (Kalimantan Tengah, Jawa Barat, Riau).
4. **BRWA geometry coverage: 1756 of 2283 territories (~77%)** — much better than earlier in the
   project (was 72/2283), but 527 territories still have no polygon on file. All 2283 have their
   policy tier classified from the list regardless (a separate, cheaper thing).
5. **No scraper runs automatically.** SRUK and SRN-PPI scrapers were run manually during local
   verification; Verra and BRWA data currently in `data/raw/` is 1-2 days old as of last check,
   pulled from existing output rather than a fresh run (no BRWA scraper exists in this tree at
   all — that data's provenance is external to this codebase). No scheduler exists for any source.
6. **16 of 25 regulatory rules have permanently unverifiable continuity** across the file-swap
   incident (Section 6) — not fixable, just a fact to know.
7. **No FastAPI service, no database, no real frontend.** Everything is a Python function called
   from test scripts or ad-hoc verification runs.
8. **India/Nepal expansion (Gluri's own stated openness to it, Section 2) is not built** — the
   current country filter is Indonesia-only by design; expanding it needs the same rigor applied
   to the original Indonesia filter (real volume testing, not just loosening a condition).