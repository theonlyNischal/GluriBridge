# GluriBridge

Indonesia forestry-carbon partner discovery pipeline for Gluri (I'm in Busan Impact Hackathon
2026, Demo Day 5 September 2026). Normalizes SRUK/SRN-PPI/Verra project data + BRWA
customary-territory evidence + Tavily news signals into one ranked, evidence-backed candidate
list — with generated dossiers, bilingual (EN/ID) outreach drafts, and a real, checkable source
citation behind every claim — served by a live FastAPI + SQLite backend and a real frontend.

**This README reflects the actual, tested state as of 2026-09-04 — not the plan, the state.**
Every claim below has a corresponding test file, or a live curl/browser check, that was run and
produced the stated result. (This file was significantly stale before 2026-08-27 — see
`PROJECT_CONTEXT.md` Section 7 if you're wondering why the git-blame-equivalent history looks
uneven; it's now been given the same full-accuracy pass as everything else here, and is kept
current as the real frontend has moved since — most recently a plain-language terminology pass,
a second visual-direction pivot to rounded/soft-shadow cards, a Dashboard-scoped EN/KO toggle, a
new cold-open landing page at `/` with the app itself moved to `/dashboard`, the real GluriBridge
logo/favicon, a real Sync/Registry page (`/sync`) with live per-source refresh, a persisted
refresh log, and real Tavily wiring, an outreach-email rewrite (a recipient-facing context
sentence in place of a raw gap-analysis recital), thin (news-only) candidates now persisting
across refreshes instead of silently disappearing, an expanded Tavily query vocabulary, and a
clickable KPI row on the Candidates page matching the Dashboard's; full detail in
`PROJECT_CONTEXT.md` Section 7.)

## Setup — works the same on Linux/WSL and macOS

This project has no OS-specific code paths (checked directly, not assumed) — the only difference
is how you install Python/Node. You need:

- **Python 3.10+** and **Node 18+** on your `PATH`. Confirm with `python3 --version` and
  `node --version` — this project was last verified against Python 3.12 and Node 18.19.
  - **macOS**: if you don't already have these, `brew install python node` (Homebrew). If
    `pip install -r requirements.txt` fails specifically on `shapely` (a geometry library with a
    native dependency), install its underlying library first: `brew install geos`, then re-run
    pip install — modern shapely ships a prebuilt wheel for both Intel and Apple Silicon Macs, so
    this is only a fallback, not the expected path.
  - **Linux/WSL**: `python3`/`pip3` and Node via your distro's package manager or `nvm` are both
    fine; this is the environment this project has been developed and tested in day to day.
- **No `.env` file is required for local development** — the frontend defaults to
  `http://localhost:8000` for the API, and the backend has no required environment variables.
  (`VITE_API_BASE` only matters for a production build pointed at a deployed backend — see
  `PROJECT_CONTEXT.md` Section 7's deployment entry if you need that.)

## Directory layout

```
repo root/
├── frontend-react/            the real, current frontend — React + Vite + TypeScript + Tailwind
│   │                           (9 routes: Landing (`/`, cold-open, no app chrome), Dashboard
│   │                           (`/dashboard` — was `/` before 2026-09-03), Candidates, Territory
│   │                           Discovery, Candidate Detail, Partnerships/Tracked, Sync/Registry
│   │                           (`/sync`), How this works, Design System)
├── frontend/                  legacy static prototype (index.html) — superseded by
│                               frontend-react, kept only for historical reference, not run
│                               day to day
├── backend/
│   ├── app/                   FastAPI service — main.py, db.py, scheduler.py, routes.py
│   ├── gluribridge/            core package — normalizers, match, scoring, dossier, outreach,
│   │                           citations, compliance, pipeline, export
│   ├── scrapers/               sruk, srn_ppi, verra, brwa
│   ├── data/                   raw/, regulatory/, .freeze
│   ├── tests/                  all test_*.py + sample_data/ fixtures
│   ├── exported_output_stage3/ current real export — orchestrate.py writes here, the API seeds from here
│   ├── orchestrate.py
│   ├── requirements.txt
│   └── gluribridge.db          created at runtime, not committed
├── PROJECT_CONTEXT.md         the full "why" behind every decision — read this if you're new
└── README.md                  this file
```

## Running the live service — two terminals

**Terminal 1 — backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app
```

On first startup, if `backend/gluribridge.db` doesn't exist yet or is empty, it seeds itself from
`backend/exported_output_stage3/` (the current, already-verified real export — no live Tavily
calls spent just to start the service). A background scheduler then reuses `orchestrate.py`'s
existing cadence/freeze logic (imported directly, not reimplemented) to check hourly whether any
source is due for a re-scrape, respecting `data/.freeze` exactly as the CLI always has.
Interactive API docs at `http://localhost:8000/docs` once running.

**Terminal 2 — frontend** (the real one, `frontend-react/`, not the legacy `frontend/` static
prototype):

```bash
cd frontend-react
npm install
npm run dev
# open the URL Vite prints — http://localhost:5173 by default
# that's the new cold-open landing page (2026-09-03); click "View dashboard"
# or go straight to http://localhost:5173/dashboard for the actual app
```

Vite's dev server proxies nothing special — the app calls the live backend directly at
`http://localhost:8000` (see `frontend-react/src/lib/api.ts`), so both terminals need to be
running together.

**API endpoints (v1)**: `GET /candidates` (`?sort_by=need_score|credibility_score`),
`GET /candidates/{id}` (+ `/dossier`, `/outreach`, `/citations`), `GET /tentative-links`,
`GET /brwa-coverage-gaps`, `GET /stats`, `POST /refresh` (`?force=source1,source2&with_news=
true&only=sruk|srn_ppi|verra|brwa` — 423 while frozen, 409 while another refresh is already
running, 202 + real-time progress via `GET /refresh-status`), `GET /refresh-log` (persisted
history of every refresh attempt).

## Running the tests

Run from `backend/tests/` (paths inside the test files are relative to it):

```bash
cd backend/tests
python3 test_run.py            # identity resolution: Katingan 3-way merge (SRUK+SRN-PPI+Verra)
python3 test_hardening_2.py    # identity resolution stress tests: Seram collision, Kalimantan proximity cluster
python3 test_brwa.py           # BRWA spatial evidence, single territory
python3 test_brwa_2.py         # BRWA at real scale: 2283-territory list, policy tier classification
python3 test_news_matching.py  # Tavily hit decision logic (mocked — the live API has since actually run many times, see below)
python3 test_contact_tier_b.py # Tier B contact resolution, including the adversarial content-check case
python3 test_scoring.py        # need vs. credibility scoring, two-axis ranking
python3 test_dossier.py        # dossier generation, 3 contrasting real profiles
python3 test_outreach.py       # outreach email generation, 5 contrasting real profiles (English + Indonesian)
python3 test_citations.py      # citation linking, 4 contrasting real cases + full-128 sweep
python3 test_pipeline.py       # full pipeline, BRWA-only variant
python3 test_full_pipeline.py  # full pipeline: normalize -> resolve -> BRWA -> news -> Tier B -> score -> dossier
python3 test_export.py         # frontend-shaped JSON export (writes to exported_output/)
python3 test_activity_type.py  # activity-type classification (Peatland/Reforestation/Social forestry/Conservation/IFM), multi-tag real cases
python3 test_compliance.py     # Permenhut 6/2026 rule evaluation against real pipeline output
python3 test_thin_candidate_persistence.py  # thin candidates carried forward across runs, not silently dropped (offline, no live Tavily calls)
```

All 16 pass from this location — re-confirmed 2026-09-04 (13 immediately after the `backend/`
reorg on 2026-08-27, plus `test_activity_type.py` and `test_compliance.py` added since, plus
`test_thin_candidate_persistence.py` added the same day; run directly again after the Tier C
contact-preservation fix, not assumed). If any fail on your machine, that's a real regression
worth investigating, not an expected flake.

## What's built and tested against real data

| Module | Does | Confidence |
|---|---|---|
| `schema.py` | `UnifiedCandidateRecord` — same 40-ish field shape for every source | High |
| `normalize_sruk.py` | SRUK + SRN-PPI -> unified record, 2 known schema variants handled | High |
| `normalize_verra.py` | Verra -> unified record | High |
| `normalize_brwa.py` | BRWA territory + policy-tier classification, bulk loader | High on classification (2,283 profiles); geometry coverage in the real production crawl is **1,756 of 2,283 (~77%)** — a targeted re-crawl confirmed the remaining ~23% genuinely have no embedded geometry on BRWA's own site, that's the real ceiling, not an in-progress number |
| `match.py` | Identity resolution: fuzzy + geo + description, conflict detection | High — many distinct real bug classes found via actual adversarial test data across the whole project. A province pre-filter cut cross-province tentative-link flooding from 2,872 down through several further real fixes (a translation-gap bug in that same filter, then a raw-record dedup fix) to the current real **84** tentative links — full step-by-step history in `PROJECT_CONTEXT.md` Section 6, current number verified directly against `exported_output_stage3/tentative_links.json` |
| `news_matching.py` | Tavily query building, corroborate/new/discard decision. Vocabulary expanded 2026-09-04 (per-province templates 4→8, global 2→4 — added REDD+, peatland, org/developer-focused, and DRAM/DPP terms; see `PROJECT_CONTEXT.md` Section 7 for why it's ~2x, not the ~3.5x a fuller list would have produced) | **Live API has actually run repeatedly** — smoke test, staged batches, and multiple full production runs across all real provinces, including a real run of the expanded vocabulary itself (300 queries, 1160 hits) |
| `tavily_client.py` | API wrapper, schema verified against Tavily's current docs | **Executed live and confirmed correct** — the real response schema matched what this was written against on the first try |
| `contact_resolution.py` | Tier B: org-website contact lookup, content-based self-identification gate | Tested including adversarial cases; live Tavily runs surfaced and fixed several further real false-positive causes (an unrelated-page self-referential-language false hit, a domain-unrelated placeholder email, a short-org-slug acronym collision) — full list in `PROJECT_CONTEXT.md` Section 6 |
| `compliance.py` | **4 of 25** encoded Permenhut rules wired: R003 (Pasal 6(1), Pelaku Usaha category), R006 (Pasal 10, Unit Karbon precondition), R016 (Pasal 61, deadline badge), R022 (Pasal 20, DPP-track precondition) | Tested against real candidates; the other 21 are flagged in `NOT_WIRED_REASONS` with a specific individual reason each — not a blanket "not done yet" |
| `scoring.py` | Two-axis scoring: need_score + credibility_score, split deliberately (see below) | Tested against all real candidates across every profile shape encountered |
| `dossier.py` | Template-based (no LLM) one-page dossier per candidate | Tested against contrasting real profiles |
| `outreach.py` | Bilingual (EN/ID) outreach email generation, template-based/no-LLM, same philosophy as `dossier.py`. Rewritten 2026-09-04: the opening is now ONE recipient-facing context sentence (selected from a small fixed table keyed by whichever real scoring.py rule fired, e.g. "neither a DRAM nor a DPP on file" → "moving through the registration and validation process") in place of directly reciting every internal gap-analysis reason — the full gap analysis is unchanged, just no longer sent to the recipient | Tested against 5 contrasting real profiles (Tier A, Tier B, no-contact thin, Katingan, a hypothesis-tagged context sentence correctly hedged while a fact-tagged one in the same batch isn't) — hedging language pinned down with explicit assertions in **both** languages |
| `citations.py` | Resolves a real, checkable source for every need/credibility reason — document URL, BRWA decree, news article, or an honest no-document note; never a fabricated link | Tested against 4 contrasting real cases + a full-128-candidate sweep **in an actual browser** (click-through, real captured download events for PDF citations) — 0 broken links, 0 empty notes |
| `pipeline.py` | One orchestrating function: normalize -> resolve -> BRWA -> news -> Tier B -> score -> dossier -> outreach -> citations. `prior_thin_candidates` param (2026-09-04) carries news-only candidates forward across runs instead of losing any not rediscovered by that run's own search, seeded into the same matching pool a fresh hit can already corroborate against; a same-run URL-dedup guard stops the identical real source (returned under two different queries) from creating two candidates | Tested end-to-end; the persistence + dedup behavior specifically verified offline in `test_thin_candidate_persistence.py` |
| `export.py` | Frontend-shaped JSON (`ranked_candidates.json`, `candidate_details.json`, etc.) | Tested; the display-order-only tiebreaker (need_score desc, credibility_score desc, has_resolved_contact desc, document_count desc) never touches the scores themselves |
| `backend/orchestrate.py` | Thin scheduler-like layer above ingestion + `run_pipeline()` — per-source cadence (SRUK/Verra daily, SRN-PPI monthly, BRWA manual), `data/.freeze` to hold data stable across a demo window, real Tavily wiring (`get_tavily_api_key()`, `TAVILY_API_KEY` loaded from repo-root `.env` via `python-dotenv`), a `preserve_contacts_by_registry_key` mechanism that protects Tier B/manual email + Tier C phone/public-presence contacts across a registry-only rebuild, `_read_prior_thin_candidates()` so a news-only thin candidate carries forward across runs instead of silently disappearing when a later run's own search doesn't happen to re-surface it | Live-verified: correctly resolves paths from its new `backend/` location, `--dry-run` blocks under freeze exactly as designed, `--skip-scrape` runs pipeline+export end-to-end; a real 203-project Verra rate-limiting completeness bug, a real Tier C data-loss bug, and the thin-candidate persistence gap were all found and fixed this way — see `PROJECT_CONTEXT.md` Section 7 |
| `backend/app/` (FastAPI + SQLite) | Live API serving the same data the frontend used to read from static files — `db.py` (+ a persisted `refresh_log` table), `scheduler.py` (reuses `orchestrate.py`'s cadence/freeze, doesn't reimplement it; a real fire-and-forget `BackgroundTasks` refresh with live per-source progress), `routes.py`, `main.py` | Live-verified: all endpoints tested with real requests, including `POST /refresh` (`?only=`, `with_news=`), `GET /refresh-status`, `GET /refresh-log`; API responses for real candidates are byte-for-byte identical to the source export; `POST /refresh` returns 423 while frozen, 409 while another refresh is in progress; a full frontend sweep against the *live* API (not static files), 0 errors |
| `frontend-react/` (React + Vite + TS + Tailwind) — **the current, real frontend** | 9 routes: Landing (`/`, cold-open front door, no sidebar/header chrome — one headline, 3 live proof-point numbers, one CTA to `/dashboard`), Dashboard (`/dashboard`), Candidates List (KPI row clickable into a filtered view, matching the Dashboard's own — added 2026-09-04), Territory Discovery, Candidate Detail, Partnerships/Tracked, Sync/Registry (`/sync` — live per-source refresh with real-time progress, a persisted refresh-attempt log, and the dataset-staleness banner scoped to just this page), How this works (`/how-it-works` — live data-sources/methodology explanation), Design System (reference page). Calls the live API directly, lazy per-candidate detail fetch. Visual language: rounded, soft-shadow `.instrument-panel` cards on a paper/topographic-watermark background (superseded an earlier flat/hairline/no-shadow direction on 2026-09-02/03 — see `PROJECT_CONTEXT.md` Section 7), rolled out across every page. Dashboard additionally has an EN/KO language toggle (header, top-right) — Korean text on the nav chrome and the Dashboard page only, every other page stays English by design; see `frontend-react/src/lib/i18n.ts` | Live-verified per page: `npx tsc --noEmit --project tsconfig.app.json` clean, real browser sweeps (no console errors, no horizontal overflow at 1280/1440/1600px) on every route — via Python Playwright (`gluri_env`; **no Node Playwright package is installed in this directory**, corrected 2026-09-04 after checking rather than assuming), plus page-specific real-data checks (equal-height score cards measured via `getBoundingClientRect()`, rail/tab scroll-sync, filter/sort/pagination correctness, map marker rendering, EN/KO toggle confirmed not to leak onto out-of-scope pages, KPI-card-click-to-row-count invariant confirmed exactly on the Candidates page) |
| `frontend/index.html` — **legacy static prototype, superseded** | Single-file dashboard + detail page, calls the live API, lazy per-candidate detail fetch. Kept only for historical reference — `frontend-react/` is what actually runs now, this is not maintained or re-verified alongside it | Full-128 sweep in an actual browser, as of when this was still the live frontend (dashboard, outreach panel, citation links, bilingual text, dataset-staleness banner) |

## Why need_score and credibility_score are separate, not one number

A mature, fully-documented project (e.g. Katingan, confirmed across 3 registries) will score
low on `need` — not because it's a bad candidate, but because there's no detected documentation
gap for Gluri to fill. A brand-new DRAFT submission missing its DRAM will score high on `need`
and lower on `credibility`. Blending these into one number hides which situation you're looking
at. Sort by either axis depending on what you're trying to find.

## Known bugs found and fixed during development

There have been many, across every layer — identity resolution (a province-translation bug that
was silently hiding real candidates from review, a raw-data duplication bug affecting 42% of
candidates), Tier B contact resolution (four separate hardening rounds, including a false
positive that routed a candidate's contact to a US Federal Register notice), a dummy/test-data
filter, a display-order tiebreaker that was being silently discarded by a second code path before
anyone noticed, two real reorg-caused import bugs caught and fixed the same round they were
introduced, a Verra API rate-limiting bug that silently shrank the registry input (found via the
crawler's own logs, not assumed), a contact-preservation mechanism that protected Tier B email
but had two real gaps for Tier C phone/public-presence data, and news-discovered "thin" candidates
silently disappearing on any refresh that didn't happen to rediscover them (caught by the user
asking why a count could ever decrease). **Full list, with real numbers and reasoning for each:
`PROJECT_CONTEXT.md`, Sections 6 and 7.** Not duplicated here — that document is long specifically
so this one doesn't
have to be, and so nobody has to reconcile two different bug lists that might drift apart.

## Open items — genuinely not done, not just "could be nicer"

1. **Tier C contact resolution is real but manual-only — no automated pipeline step exists.**
   A hand-judged round (2026-09-01, 86-candidate coverage, each verified against a real page
   before trusting it — an org's own website footer, a verified social-media bio, never a
   third-party mention) found 18 real phone/WhatsApp numbers and 15 public-presence links
   (website/Facebook/Instagram). `RegistrantContact` carries dedicated fields for all of it
   (`phone`, `phone_source`, `website_url`, etc. — see `schema.py`), and a real bug that silently
   erased this data on every subsequent rebuild was found and fixed (2026-09-04, see
   `PROJECT_CONTEXT.md` Section 7) — but nothing in `run_pipeline()` itself ever *searches* for a
   phone/WhatsApp number the way Tier B automatically searches for an email; every phone/presence
   value on file came from that one manual round, not a repeatable process. Full reasoning for why
   it stayed manual-only: `PROJECT_CONTEXT.md` Section 7.
2. **`PROVINCE_LOOKUP_ID_TO_EN` in `normalize_sruk.py` still has only 3 entries** (Kalimantan
   Tengah, Jawa Barat, Riau). A related correctness bug in `match.py`'s use of this table was
   found and fixed this project (see `PROJECT_CONTEXT.md` Section 6); the table itself staying
   incomplete just means Verra candidates outside those 3 provinces get no BRWA province
   pre-filter optimization — works, just slower.
3. **Bilingual outreach covers only the fixed template strings, not `dossier.py`'s own dynamic
   content — checked directly (2026-09-04), not assumed, after an outside reviewer flagged it as
   "half-translated."** Confirmed: `dossier.py` has zero Indonesian output anywhere in the system,
   exactly as already documented here — not a regression. The email's pitch (`suggested_poc`) and
   discovery questions still stay English inside both language sections. The one-sentence context
   line (see `PROJECT_CONTEXT.md` Section 7's outreach-rewrite entry) is new since this was last
   written and now has a real Indonesian twin, narrowing — not closing — this gap. Giving
   `dossier.py` real Indonesian dynamic content is a natural, larger follow-up, not done here.
4. **`news_actions` (the per-hit discard/corroborate/new-thin-candidate log) isn't persisted.**
   The aggregate counts in `pipeline_stats.json` are enough for today's reporting and the discard
   count is exactly derivable from them, but auditing *why* one specific hit was discarded isn't
   possible after the process that produced it exits.
5. **Automated (scheduler-triggered) refreshes are registry-only, not news-enriched — deliberately,
   and this is now surfaced explicitly, not silently.** The background scheduler's automatic
   hourly tick never passes `with_news=True` (unattended recurring live-API spend was judged a
   materially bigger decision than this build's scope). This USED TO mean a registry-only refresh
   quietly dropped every news-discovered "thin" candidate (news-only candidates have no
   registry_ids to be rediscovered by); as of the 2026-09-04 thin-candidate-persistence fix, that's
   no longer true — a registry-only refresh now carries every existing thin candidate forward
   unchanged instead of losing it, the same way it already preserved Tier B/C contacts. What a
   registry-only refresh still can't do is find NEW thin candidates or new corroborating evidence
   — that genuinely requires a live news search. `GET /stats` reports `last_registry_refresh` and
   `last_full_refresh_with_news` separately, with an explicit `news_data_stale` flag and message;
   the frontend's amber staleness banner now renders only on the Sync page (`/sync`, moved there
   from every page on 2026-09-04), where a real `POST /refresh?with_news=true` (or a per-source
   button, or "Refresh with live news") is one click away. The property THIS fix addresses caused
   three real data-loss incidents during the Sync feature's own build and use — full
   incident-by-incident account, including one unrecoverable case and the fix that followed it,
   in `PROJECT_CONTEXT.md` Section 7.
6. **A responsible-party change on an existing registration isn't flagged as its own signal.**
   Found by accident investigating a raw-data dedup bug: at least one real organization's SRUK
   submission had its registered responsible party changed between two scrapes of the identical
   submission (same internal registry ID). Nothing today detects or surfaces this — a
   compliance-minded tool arguably should. Product idea, nothing built.
7. **The org-extraction regex (`news_matching.py`) and the self-identification content checks
   (`contact_resolution.py`) are both keyword/pattern-based**, not proven against arbitrary new
   phrasing beyond what real Tavily data has actually surfaced so far. One short-org-slug
   collision ("PT Carbon" vs "Carbon Creek PT") is a deliberate, permanent residual limitation,
   not an oversight — see `PROJECT_CONTEXT.md` Section 7 for the reasoning.

## Sample data included in this package

- `backend/tests/sample_data/sruk/` — 6 real SRUK/SRN-PPI records (Katingan pair, 3 Seram
  companies, 1 VER-prefix record)
- `backend/tests/sample_data/uploads/` — real Verra scraper output (13 projects), 2 more SRUK
  records, 2 BRWA profile+geojson pairs, the full 2,283-row BRWA list (`wa_list.json`)
- `backend/tests/sample_data/brwa_bulk/profiles/` — all 2,283 real BRWA territory profiles
- `backend/tests/sample_data/brwa_bulk/geojson/` — 72 real BRWA territory geometries. This is a
  **frozen snapshot from initial handoff**, deliberately kept as-is as a stable test fixture — it
  does NOT reflect real production coverage, which is 1,756 of 2,283 (~77%, see Open Items #2 in
  `PROJECT_CONTEXT.md` Section 7). Don't read "72" here as the current real number; it's what
  the test fixtures ship with, on purpose.

None of this is synthetic. Every number in every test file's expected output was checked against
these actual files, not invented — same discipline the live backend/frontend numbers above were
held to.
