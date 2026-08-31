# GluriBridge — frontend

The real, current frontend for GluriBridge (Indonesia forestry-carbon partner discovery pipeline)
— React + Vite + TypeScript + Tailwind CSS. Supersedes the static `frontend/index.html` prototype
one level up in the repo, which is kept only for historical reference and isn't run day to day.

**See the repo-root `README.md` for full setup instructions** (backend + frontend together,
including macOS-specific notes) and `PROJECT_CONTEXT.md` for the full "why" behind how this app is
built. The short version, from this directory, once the backend (`cd ../backend && uvicorn
app.main:app`) is running in another terminal:

```bash
npm install
npm run dev
# open the URL Vite prints — http://localhost:5173 by default
```

By default the app calls the backend at `http://localhost:8000` (`src/lib/api.ts`). Set
`VITE_API_BASE` at build time to point a production build at a different backend (used for the
Render static-site deployment) — not needed for local development.

## Pages (`src/pages/`, routed in `src/App.tsx`)

| Route | Page | What it's for |
|---|---|---|
| `/` | Dashboard | KPI overview, need/credibility Opportunity Matrix, province breakdown |
| `/candidates` | Candidates List | The full ranked, filterable, sortable candidate list |
| `/territories` | Territory Discovery | BRWA customary-territory map + search + coverage stats |
| `/candidates/:id` | Candidate Detail | Full per-candidate dossier, scoring breakdown, contact, outreach draft |
| `/tracked` | Partnerships | Status-tracked candidates + the status/note/history editor |
| `/how-it-works` | How this works | A permanent, honest explanation of the pipeline and its data sources — every number on it is fetched live from the real API, not typed in |
| `/design-system` | Design system | Reference page for this app's own color/type/component conventions |

## Conventions worth knowing before changing anything here

- **`src/lib/types.ts` mirrors the backend's real API response shapes exactly** — if a type here
  looks wrong, the bug is in this file (or the backend actually changed), not a reason to reshape
  real API data to fit a nicer-looking type.
- **No hardcoded numbers where a real one is available.** Anywhere the UI shows a specific count,
  score, or percentage, it's fetched from the live API (`GET /stats`, `GET /candidates`,
  `GET /candidates/{id}`) — see `/how-it-works` for the clearest example of this discipline.
- **`HonestState` is the one pattern for every "we're telling you what we don't know" state** —
  not yet checked, no data on file, not-trusted coordinates, insufficient contact, no source
  document, not-applicable compliance. Reuse it rather than writing new ad hoc absence-state
  markup; see the Design System page's "Honest disclosure states" section for the full set.
- **The visual language is "field-instrument"** (sharp corners, hairline borders, no drop shadow,
  live-pulse dots on live numbers, paper background + topographic watermark, one reserved warm
  accent per screen) — `Panel` and `KpiCard` both support this via an opt-in
  `variant="instrument"` prop, default unchanged. See the Design System page's "Field instrument
  variant" section for a live side-by-side against the plain default.
- **Standard verification for any change here**: `npx tsc --noEmit --project tsconfig.app.json`
  (the bare `tsc` invocation silently checks nothing in this project — always pass
  `--project tsconfig.app.json`), a check for 0 console errors and 0 horizontal overflow at
  1280/1440/1600px, and a real screenshot of the changed page before calling anything done.
