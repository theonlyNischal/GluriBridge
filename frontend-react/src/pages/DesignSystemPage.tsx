import { EvidenceTag } from "../components/ui/EvidenceTag";
import { HonestState } from "../components/ui/HonestState";
import { CitationLink } from "../components/ui/CitationLink";
import { ComplianceBadge } from "../components/ui/ComplianceBadge";
import { ScoreBadgeCompact } from "../components/ui/ScoreBadgeCompact";
import { ScoreLabelPill } from "../components/ui/ScoreLabelPill";
import { Panel } from "../components/ui/Panel";
import { KpiCard } from "../components/ui/KpiCard";
import type { ScoreLabel } from "../lib/types";

const SWATCH_GROUPS: { name: string; scale: string; shades: number[] }[] = [
  { name: "Forest — brand / credibility axis", scale: "forest", shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: "Clay — need axis", scale: "clay", shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: "Teal — evidence / geospatial accent", scale: "teal", shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { name: "Stone — neutrals (warm, not cold gray)", scale: "stone", shades: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
];

const SCORE_LABELS: ScoreLabel[] = ["opportunity", "confirmed", "strong_lead", "mixed", "early_signal"];

export function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold text-stone-900">GluriBridge design system</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-stone-500">
          Deep forest/earth palette, an editorial serif for identity, a tabular monospace for every real data figure — built so the
          recurring evidence patterns (fact/hypothesis, honest disclosure, citations, compliance, the two-axis score) render one
          consistent way everywhere in the app, not reinvented per panel.
        </p>
      </header>

      {/* ---------- color ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Color</h2>
        <div className="mt-4 space-y-5">
          {SWATCH_GROUPS.map((g) => (
            <div key={g.scale}>
              <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">{g.name}</div>
              <div className="flex overflow-hidden rounded-lg border border-stone-200">
                {g.shades.map((s) => (
                  <div key={s} className={`h-14 flex-1 bg-${g.scale}-${s} flex items-end justify-center pb-1`}>
                    <span className={`font-mono text-[10px] ${s >= 500 ? "text-white/80" : "text-black/50"}`}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">Compliance (a genuine urgency axis — kept separate from need/credibility)</div>
            <div className="flex gap-2">
              {(["green", "amber", "red", "not_applicable"] as const).map((b) => (
                <ComplianceBadge key={b} badge={b} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- typography ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Typography</h2>
        <div className="mt-4 space-y-4 rounded-xl border border-stone-200 bg-white p-6">
          <div>
            <div className="font-display text-3xl font-semibold text-stone-900">Fraunces — display / identity</div>
            <div className="mt-1 text-[12px] text-stone-400">Candidate names, page titles, the brand register. Editorial, institutional — not generic SaaS grotesk.</div>
          </div>
          <div>
            <div className="font-sans text-lg font-semibold text-stone-900">Inter — UI &amp; body</div>
            <div className="mt-1 text-[13px] text-stone-500">Every label, paragraph, nav item, and button in the app. Highly legible at small sizes.</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-semibold tabular text-stone-900">IBM Plex Mono — 88.9 / 41.2</div>
            <div className="mt-1 text-[12px] text-stone-400">Every score, coordinate, date, registry ID, and percentage — genuinely tabular figures, so precise real data reads as visibly distinct from prose.</div>
          </div>
        </div>
      </section>

      {/* ---------- two-axis score ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Two-axis need / credibility display</h2>
        <p className="mt-1 text-[13px] text-stone-500">
          Never blended into one number, in either variant. Compact pairing for headers/list rows; the score_label pill (list-view-only,
          colored by which axis dominates, never good/bad) always keeps both real numbers beside it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-6 rounded-xl border border-stone-200 bg-white p-6">
          <ScoreBadgeCompact need={88.9} cred={41.2} />
          <div className="flex flex-col gap-2">
            {SCORE_LABELS.map((l) => (
              <ScoreLabelPill key={l} label={l} need={l === "confirmed" ? 11.1 : 88.9} cred={l === "confirmed" ? 88.2 : l === "opportunity" ? 41.2 : 64.7} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- fact/hypothesis ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Fact vs. hypothesis</h2>
        <p className="mt-1 text-[13px] text-stone-500">Solid teal fill vs. outlined clay — the shape difference is deliberate, not just color, so it still reads without color.</p>
        <div className="mt-3 flex gap-3 rounded-xl border border-stone-200 bg-white p-6">
          <EvidenceTag level="fact" />
          <EvidenceTag level="hypothesis" />
        </div>
      </section>

      {/* ---------- honest disclosure ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Honest disclosure states</h2>
        <p className="mt-1 text-[13px] text-stone-500">
          One dashed-border, muted-stone treatment for every "we're telling you what we don't know" state — not_yet_checked,
          no data on file, not-trusted coordinates, insufficient contact, not-applicable compliance. Never styled as an error.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <HonestState kind="not_checked">No coordinates on file to test against Customary Territory Registry (BRWA) data — this is not the same as "no overlap found."</HonestState>
          <HonestState kind="not_trusted">Single-source International Registry (Verra) coordinate falls outside Indonesia's real bounding box — treated as not yet available rather than trusted.</HonestState>
          <HonestState kind="insufficient">No contact information available at all.</HonestState>
          <div className="flex items-center">
            <HonestState kind="no_source" compact title="Confirmed via a registry field — no downloadable document exists to cite." />
          </div>
        </div>
      </section>

      {/* ---------- citations ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Citations</h2>
        <div className="mt-3 flex items-center gap-6 rounded-xl border border-stone-200 bg-white p-6">
          <CitationLink citation={{ source_type: "SRUK registry record", url: "https://example.org/doc.pdf", retrieved_at: null, note: null }} />
          <CitationLink citation={{ source_type: "N/A", url: null, retrieved_at: null, note: "Confirmed via a registry field — no downloadable document exists to cite." }} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Composed: a real panel</h2>
        <div className="mt-3">
          <Panel title="Example panel treatment">
            <p className="text-[13.5px] text-stone-700">Panels are the one consistent card shape — white surface, warm stone border, rounded-xl — used for every section on every page.</p>
          </Panel>
        </div>
      </section>

      {/* ---------- field instrument variant (2026-08-31 rollout) ---------- */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800">Field instrument variant</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-stone-500">
          "Satellite telemetry meets field cartography" — the app's actual subject (Indonesia forestry-carbon monitoring) rather than a
          generic SaaS look. Rolled out page-by-page across Dashboard, Candidates List, Territory Discovery, Candidate Detail, and
          Partnerships. Opt-in via <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">variant="instrument"</code> on{" "}
          <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">Panel</code> and{" "}
          <code className="rounded bg-stone-100 px-1 py-0.5 font-mono text-[11px]">KpiCard</code> — the default variant shown throughout
          the rest of this page is untouched and still the right choice for anything not part of the rollout.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">Default — rounded-xl, soft shadow</div>
            <Panel title="Default panel">
              <p className="text-[13px] text-stone-600">Used everywhere before the rollout, and anywhere the rollout hasn't reached.</p>
            </Panel>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">Instrument — sharp corners, hairline border, no shadow</div>
            <Panel title="Instrument panel" variant="instrument">
              <p className="text-[13px] text-stone-600">A printed field-instrument reads this way — flat, sharp-edged, no drop shadow.</p>
            </Panel>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Default KPI" value={144} variant="default" />
          <KpiCard label="Instrument KPI" value={144} variant="instrument" />
          <KpiCard label="Instrument + live" value={144} variant="instrument" live />
          <KpiCard label="Instrument + accent" value={19} accent="clay" variant="instrument" />
        </div>
        <p className="mt-2 max-w-2xl text-[12px] text-stone-500">
          The live-pulse dot (top right, "Instrument + live") marks a number that's read fresh from the API on every page load — a
          telemetry cue, not decoration. Only ever one clay accent per screen (see below).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">bg-field-paper + topo-watermark</div>
            <div className="topo-watermark bg-field-paper flex h-24 items-center justify-center rounded border border-stone-300 text-[12px] text-stone-500">
              The chosen background — every rolled-out page's scrolling content area
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-semibold text-stone-600">bg-field-charcoal + topo-watermark-on-dark</div>
            <div className="topo-watermark-on-dark bg-field-charcoal flex h-24 items-center justify-center rounded border border-stone-700 text-[12px] text-stone-300">
              Built for comparison during the Dashboard test, not chosen — kept for reference only
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-stone-600">
          <strong>Accent restraint:</strong> each screen reserves exactly one warm accent (almost always clay, on whichever number
          represents outstanding need/action) and mutes every other decorative forest/teal/amber usage to ink/stone. This is never
          applied to functional, data-encoding color — score-axis colors, map marker/legend colors, status/evidence tags, teal as this
          app's own geospatial-evidence signal, and genuine primary-action buttons all keep their real color regardless of this rule.
        </p>
      </section>
    </div>
  );
}
