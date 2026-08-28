# Verra VCS Monthly Crawler (API-based)

No browser, no Playwright, no cookie banners, no greenlet/threading
headaches. The public registry's own frontend calls a plain JSON API for
project details -- we call it directly.

## Files

| File | Role |
|---|---|
| `verra_crawler.py` | Orchestrator — run this. |
| `verra_list.py` | Loads `Verra_Projects.xlsx`, AFOLU-filters, diffs month-over-month. Unchanged from the earlier browser-based version -- this part was never the problem. |
| `verra_api.py` | Direct `requests`-based fetch of the confirmed project-detail endpoint. |
| `verra_normalizer.py` | Maps a **real, confirmed** API payload (project VCS 2044) to the `ProjectSnapshot` schema. |
| `requirements.txt` | `requests`, `pandas`, `openpyxl`. That's it. |

## Setup

```bash
pip install -r requirements.txt
```

No `playwright install`, no system dependencies, no headless-Chromium
troubleshooting. Download **Export (All)** from
`https://registry.verra.org/verra/public/program/VCS`, save as
`Verra_Projects.xlsx`.

## Usage

```bash
python verra_crawler.py --excel Verra_Projects.xlsx                    # full run
python verra_crawler.py --excel Verra_Projects.xlsx --incremental      # new + changed + QA sample
python verra_crawler.py --excel Verra_Projects.xlsx --ids 1360,2044    # test a subset
python verra_crawler.py --excel Verra_Projects.xlsx --resume           # skip already-downloaded
python verra_crawler.py --excel Verra_Projects.xlsx --list-only        # list/diff only, no fetching
```

## The API

```
GET https://prod-us.api.platts.com/ci-raas-prod/br-reg/rest/public-report-manager/getProjectById/{vcs_id}/Markit
Headers:
    Accept: application/json
    appkey: <see verra_api.py APPKEY>
    application: Markit
    tenant: Verra
    standardacronym: VCS
    standardId: 150000000000001
```

The `appkey` is embedded in Verra's own frontend JS (same access any
browser gets), but it can rotate. **If every request suddenly fails with
401/403**, re-extract it: open the registry site, DevTools → Network →
XHR, reload a project page, find this same URL, copy the `appkey` header
value, update `APPKEY` in `verra_api.py`.

## What's confirmed vs. what still needs verification

Confirmed against a real payload (project VCS 2044, "Renewable Wind Power
Project by Torrent Power"):
- All `overview` fields (name, status, proponent, sectoral scope,
  methodology + version split, estimated annual reductions, country
  [via a same-string heuristic, see below], state, city, dates, crediting
  period, public comment URL, description)
- `geo` (latitude/longitude, found inside `mixedUnitList[0]`)
- `documents` list with clean `type_name` categories straight from the API

**Not yet confirmed (flagged in code comments, verify on your next real
run):**
- **`country`**: the payload has no clean `country_name` field at the top
  level for this project (it was `null`) — the normalizer falls back to
  parsing the last comma-separated segment of the address string (worked
  correctly here: extracted "India"), but this is a heuristic, not a
  guaranteed field. If a future project's address format differs, this
  could silently return the wrong thing.
- **Document URLs**: every document in the test payload had the *same*
  `document_link` value (`/downloadDocumentById/1`) despite having
  distinct `id`s — this looks like a template with a placeholder, so the
  normalizer substitutes each document's real `id` in its place. **This
  substitution is unverified — I have no network access to actually try
  downloading one.** Test it on your first real run; if it 404s, the raw
  untouched link is kept under `_raw_document_link` in each document dict
  for comparison.
- **`units_summary`**: the test project was a "pipeline listing" with no
  issued units yet, so every quantity field (`vcus_issued`, `vcus_active`,
  etc.) was `null` in the source data — meaning the *mapping* is confirmed
  present at the right JSON path, but not confirmed to contain sensible
  values once a project actually has issued/retired units. Check this
  against a fully-registered project with real unit history.
- **`buffer_contributions`**: mapped to `permanenceBufferQuantity` as the
  closest-sounding field, but there are several other `*Quantity` fields
  in the payload (`adjustmentReserveQuantity`, `countrySopReserveQuantity`,
  `omgeQuantity`, `adaptationFundQuantity`) that could plausibly be "the"
  buffer figure instead — none were populated in the test payload, so this
  couldn't be disambiguated. Worth checking against a REDD+ project (buffer
  pool contributions are most relevant there).

None of these are structural risks — worst case, one field comes back
wrong or null and needs its key name adjusted in `verra_normalizer.py`.
The pipeline itself (fetch → normalize → store → diff → alert) is solid.

## Units data (added)

`getProjectById` alone doesn't reliably expose issued/active/retired/buffer
quantities (they were null on the test pipeline-listing project). Confirmed
fix: a second endpoint, keyed by the project's **internal** numeric id
(not the public VCS number):

```
POST https://prod-us.api.platts.com/ci-raas-prod/raas-credit-api/mixed-unit-manager/public/getAllStatistics
Body: {"standard_id": 150000000000001, "project_id": <internal id from detail response>}
Response: {"quantitiesByStateCode": {"Issued": ..., "Active": ..., "Retired": ..., "Buffer": ..., "Unit_Cancelled": ...}}
```

`verra_crawler.py` now makes this second call automatically for every
project, using `detail_json["project_id"]` from the first call. If the
stats call fails for any reason, the project still saves successfully with
`units_summary` falling back to the earlier (less reliable) guess, and
`stats_error` records what went wrong -- check that field if you see a lot
of nulls in `units_summary` across a run.