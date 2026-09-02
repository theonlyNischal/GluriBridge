import { Link } from "react-router-dom";
import { Users, Flame, ShieldCheck, AlertTriangle, ArrowRight, Target, Mail, Radio } from "lucide-react";
import { useCandidates } from "../lib/CandidatesContext";
import { Panel } from "../components/ui/Panel";
import { ScoreLabelPill } from "../components/ui/ScoreLabelPill";
import { ScoreStatCard } from "../components/ui/ScoreStatCard";
import { KpiCard } from "../components/ui/KpiCard";
import { DonutChart } from "../components/ui/DonutChart";
import { DashboardMap } from "../components/DashboardMap";
import { ProvinceBreakdown } from "../components/ProvinceBreakdown";
import { STATUS_OPTIONS, STATUS_DOT_COLOR } from "../components/ui/StatusBadge";
import { filterParamsToSearchParams, DEFAULT_FILTER_PARAMS } from "../lib/candidateFilter";
import type { CandidateListRow, CandidateStatusValue, ScoreLabel } from "../lib/types";

// A real, working navigational footer for a panel — every one of these
// leads somewhere real (never a dead/decorative "learn more"). 2026-08-31
// visual-polish round, added to all 7 Dashboard panels below the hero.
// Muted ink, not forest-green (2026-08-31 visual-direction test) — this
// link appears 7 times on one screen; giving each its own colored accent
// was exactly the "every panel has its own strong color" problem being
// fixed here. Still clearly a link (font-semibold + hover state), just
// not competing in hue with the one reserved accent.
function PanelLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-stone-600 hover:text-stone-900">
      {children}
      <ArrowRight size={12} strokeWidth={2.5} />
    </Link>
  );
}

// Candidate-profiles gallery (2026-09-02) — replaces the Opportunity
// Matrix scatter plot on the Dashboard's primary view. Real, named
// candidates picked automatically by real field values, never hardcoded,
// so this stays accurate as the dataset changes: one representative per
// score_label category (skipping any category with zero real candidates
// in it right now, e.g. if strong_lead's one real candidate is ever
// reclassified).
//
// Sorted by whichever axis actually DEFINES the category — a real bug
// caught before shipping: sorting "confirmed" (credibility-led) by
// need_score first picked PT Pandjiwaringin (need 22.2/cred 70.6) over
// Katingan (need 11.1/cred 88.2), the exact real candidate this feature
// was scoped against ("Katingan or similar for Confirmed") — need_score
// desc is the right primary key for "opportunity" (need-led) but the
// wrong one for "confirmed." strong_lead/early_signal have no single
// dominant axis, so they keep the app's own general default (need_score
// desc, then credibility_score desc — the same tiebreak export.py uses).
const GALLERY_CATEGORIES: ScoreLabel[] = ["opportunity", "confirmed", "strong_lead", "early_signal"];

function pickRepresentative(rows: CandidateListRow[], label: ScoreLabel): CandidateListRow | null {
  const matches = rows.filter((r) => r.score_label === label);
  if (matches.length === 0) return null;
  const byNeedThenCred = (a: CandidateListRow, b: CandidateListRow) => b.need_score - a.need_score || b.credibility_score - a.credibility_score;
  const byCredThenNeed = (a: CandidateListRow, b: CandidateListRow) => b.credibility_score - a.credibility_score || b.need_score - a.need_score;
  return [...matches].sort(label === "confirmed" ? byCredThenNeed : byNeedThenCred)[0];
}

// One real candidate's card — name/org identity (same truncate/title
// pattern as the Candidates card grid), the ScoreLabelPill labeling
// which category it represents (showNumbers=false, same as the
// candidate-detail hero, since the two ScoreStatCards below already show
// both real numbers), then the EXACT same ScoreStatCard component used
// on Candidate Detail — no children passed, so no evidence breakdown, no
// chart, no axes, no legend, just the two plain stat blocks. The whole
// card is a real link to that candidate's own detail page, same
// clickable-card pattern as everywhere else in the app.
function CandidateProfileCard({ row }: { row: CandidateListRow }) {
  return (
    <Link
      to={`/candidates/${row.candidate_id}`}
      className="instrument-panel hover-lift block border border-stone-300 bg-white p-4 transition-colors hover:border-stone-500 hover:bg-stone-100/40"
    >
      <ScoreLabelPill label={row.score_label} need={row.need_score} cred={row.credibility_score} showNumbers={false} />
      <div className="mt-2 truncate font-semibold text-stone-800" title={row.name}>
        {row.name}
      </div>
      <div className="truncate text-[12.5px] text-stone-500" title={row.org ?? undefined}>
        {row.org ?? "—"}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <ScoreStatCard axis="need" label="Opportunity" value={row.need_score} accent="clay" icon={Target} />
        <ScoreStatCard
          axis="credibility"
          label="Evidence Strength"
          value={row.credibility_score}
          capped={row.credibility_capped}
          cappedReason="Capped at 30 — this candidate's data is thin (e.g. a single uncorroborated news mention), so a higher score isn't trustworthy enough to show uncapped."
          accent="forest"
          icon={ShieldCheck}
        />
      </div>
    </Link>
  );
}

// Visual-direction test (2026-08-31) — Dashboard page only, per explicit
// scope. Flip this one constant to compare the two background options;
// nothing else in the file needs to change. See index.css's
// .bg-field-paper / .bg-field-charcoal for the actual color
// values and reasoning.
const BG_VARIANT = "paper" as "paper" | "charcoal";
const isDark = BG_VARIANT === "charcoal";

export function DashboardPage() {
  const { candidates, error } = useCandidates();

  if (error) return <div className="px-6 py-6 text-clay-700">Failed to load candidates: {error}</div>;
  if (!candidates) return <div className="px-6 py-6 text-stone-400">Loading…</div>;

  const total = candidates.length;
  // Real, automatically-picked candidates for the profile gallery below —
  // see pickRepresentative/GALLERY_CATEGORIES above. Filters out any
  // category with no real match right now rather than showing a broken
  // or fabricated card.
  const galleryRows = GALLERY_CATEGORIES.map((label) => pickRepresentative(candidates, label)).filter((r): r is CandidateListRow => r !== null);
  const highNeed = candidates.filter((r) => r.need_score >= 70).length;
  const highCred = candidates.filter((r) => r.credibility_score >= 70).length;
  const approachingDeadline = candidates.filter((r) => r.compliance_badge === "amber" || r.compliance_badge === "red").length;
  const resolvedContact = candidates.filter((r) => r.has_resolved_contact).length;
  // Deliberately separate from resolvedContact (2026-08-31 audit, real
  // live numbers: 87 of 144 have SOME contact on file, but only 4 of
  // those are an actual email — 83 are a Tier A registrant NAME with no
  // email at all). Conflating the two in the summary sentence was
  // exactly the "resolved contact" language this fixes.
  const hasEmail = candidates.filter((r) => r.has_email).length;
  // A real, manual spot-check found one of those 4 emails (a huge
  // conglomerate's generic contact page, "medium" confidence, not
  // clearly tied to the specific candidate) genuinely real but weaker
  // than the other three (each "high" confidence, confirmed via the
  // org's own copyright-footer self-identification) — kept as its own
  // distinct, separately-labeled bucket rather than lumped into hasEmail
  // above or silently dropped from the record entirely.
  const lowConfidenceEmail = candidates.filter((r) => r.has_low_confidence_email).length;
  // The real "resolved contact, but genuinely nothing to email" bucket —
  // resolvedContact minus both real-email buckets, NOT resolvedContact
  // itself (a rewrite of this line first drafted "the rest" as
  // resolvedContact's own number, which double-counts the two email
  // buckets it already contains — caught before shipping, same "state
  // the real distinct number" discipline as the split above).
  const nameOnlyNoEmail = resolvedContact - hasEmail - lowConfidenceEmail;
  // Phone/public-presence (2026-09-01, Tier C) — deliberately NOT folded
  // into the email-readiness numbers above, same non-blending principle
  // as the RegistrantContact schema itself: a phone number doesn't make
  // a candidate "email-ready," and a website/social account isn't a
  // contact channel at all. hasPhone can co-occur with any email bucket
  // (independent signal); publicPresenceOnly is deliberately restricted
  // to candidates with NO phone, so the two new numbers below never
  // double-count the same candidate.
  const hasPhone = candidates.filter((r) => r.has_phone).length;
  const publicPresenceOnly = candidates.filter((r) => r.has_public_presence && !r.has_phone).length;

  const richness: Record<string, number> = { rich: 0, corroborated: 0, thin: 0 };
  candidates.forEach((r) => {
    richness[r.data_richness] = (richness[r.data_richness] ?? 0) + 1;
  });

  // Real breakdown across all 5 outreach-status values (2026-08-28,
  // replacing the original binary contacted/not-contacted count) — same
  // donut+legend treatment as Data richness (2026-09-02), each row a
  // real link to the exact filtered Candidates view for that status.
  const statusCounts: Record<CandidateStatusValue, number> = { not_contacted: 0, contacted: 0, follow_up_needed: 0, done: 0, rejected: 0 };
  candidates.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  });

  const topNeed = [...candidates].sort((a, b) => b.need_score - a.need_score).slice(0, 5);
  const topCred = [...candidates].sort((a, b) => b.credibility_score - a.credibility_score).slice(0, 5);

  return (
    <div
      className={`px-6 py-6 topo-watermark ${isDark ? "bg-field-charcoal topo-watermark-on-dark" : "bg-field-paper"}`}
    >
      {/* Hero — eyebrow + bold headline (the real total baked directly into
          the title, not a generic page label) + the 4 metric cards as the
          main visual focus + one short supporting line. Redesigned
          2026-08-31 for more breathing room; the detailed contact-
          resolution breakdown that used to live in this spot moved to its
          own panel right below (same real numbers, same real links —
          demoted, not dropped).

          Visual-direction test (2026-08-31, Dashboard only): background,
          topographic watermark, instrument-panel card treatment, and
          accent-color reduction — see BG_VARIANT above and
          index.css's "Visual-direction test" section for the full
          reasoning. Only ONE KPI card (High Need) keeps a colored
          accent now — clay, the product's own "need/opportunity" color —
          the other three go monochrome ink/stone. The live-data pulse
          dot sits on Total Candidates instead (a distinct signal from
          "this is the important number": "this number is live right
          now"), matching the brief's own example. */}
      <div className="mb-10 pt-2 text-center">
        <p className={`text-[13px] font-semibold uppercase tracking-wide ${isDark ? "text-forest-300" : "text-forest-600"}`}>Real, evidence-backed candidate discovery</p>
        <h1 className={`mt-2 font-display text-4xl font-bold ${isDark ? "text-stone-50" : "text-stone-900"}`}>{total} real candidates in the pipeline</h1>

        <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard label="Total Candidates" value={total} sub="live from the API" to="/candidates" size="lg" icon={Users} animateValue variant="instrument" live />
          <KpiCard label="High Opportunity" value={highNeed} sub="Opportunity ≥ 70" accent="clay" to="/candidates?minNeed=70" size="lg" icon={Flame} animateValue variant="instrument" />
          <KpiCard label="High Evidence Strength" value={highCred} sub="Evidence Strength ≥ 70" to="/candidates?minCred=70" size="lg" icon={ShieldCheck} animateValue variant="instrument" />
          <KpiCard
            label="Compliance Risk"
            value={approachingDeadline}
            sub="Reporting Deadline amber/red badge"
            to="/candidates?compliance=approaching"
            size="lg"
            icon={AlertTriangle}
            animateValue
            variant="instrument"
          />
        </div>

        <p className={`mt-5 text-[13px] ${isDark ? "text-stone-400" : "text-stone-500"}`}>Independent axes · never combined into one ranking · live from the registry</p>
      </div>

      {/* Contact-readiness cards (2026-09-02 visual pass) — icon-circle +
          big number + pill-chip breakdown, replacing the inline-sentence
          rows. Still exactly the same 5 real, distinct, clickable numbers
          as before, each linking to its own accurately-filtered view —
          and still two SEPARATE cards, not one merged card: finding a
          phone number or a website doesn't change any candidate's
          email-readiness, so "Also Found" must never read as an update
          to "Contact Ready"'s own number (the real distinction this
          split has enforced since 2026-09-01, now just in card form). */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="instrument-panel border border-stone-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-50 text-forest-600">
                <Mail size={18} strokeWidth={2.25} />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Contact ready</div>
                <div className="font-mono text-[21px] font-bold text-stone-900">
                  {resolvedContact} <span className="text-[12.5px] font-medium text-stone-400">contacts identified</span>
                </div>
              </div>
            </div>
            <Link to="/candidates?contactResolved=yes" className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-forest-600 hover:text-forest-700">
              View contacts <ArrowRight size={12} strokeWidth={2.5} />
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/candidates?hasEmail=yes" className="rounded-full bg-forest-50 px-3 py-1 text-[12px] font-semibold text-forest-700 transition hover:bg-forest-100">
              {hasEmail} Verified emails
            </Link>
            <Link to="/candidates?lowConfidenceEmail=yes" className="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-200">
              {lowConfidenceEmail} Potential matches
            </Link>
            <Link
              to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, contactResolved: "yes", hasEmail: "no", lowConfidenceEmail: "no" }).toString()}`}
              className="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-200"
            >
              {nameOnlyNoEmail} Named contacts, no email
            </Link>
          </div>
        </div>
        <div className="instrument-panel border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Radio size={18} strokeWidth={2.25} />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Also found</div>
              <div className="font-mono text-[21px] font-bold text-stone-900">
                {hasPhone + publicPresenceOnly} <span className="text-[12.5px] font-medium text-stone-400">more ways to connect</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/candidates?hasPhone=yes" className="rounded-full bg-teal-50 px-3 py-1 text-[12px] font-semibold text-teal-700 transition hover:bg-teal-100">
              {hasPhone} Phone/WhatsApp
            </Link>
            <Link
              to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, hasPublicPresence: "yes", hasPhone: "no" }).toString()}`}
              className="rounded-full bg-stone-100 px-3 py-1 text-[12px] font-semibold text-stone-600 transition hover:bg-stone-200"
            >
              {publicPresenceOnly} Online presence only
            </Link>
          </div>
        </div>
      </div>

      {/* The dashboard's main content — the matrix and map get the bulk of
          the extra width, since they're what actually shows the shape of
          the real candidate pool at a glance. All real, already-computed
          data: no fabricated "trend over time" chart, since nothing in
          this pipeline tracks how a candidate's scores changed across past
          runs — that data doesn't exist. Province breakdown sits beside
          the map (not inside it) as its own real, normalized-from-real-data
          panel — see lib/provinceNormalize.ts. */}
      {/* Back to grid's default align-items:stretch (2026-09-02, second
          pass) — items-start fixed the original whitespace bug by giving
          every panel its own natural height, but that left the gallery
          (1182px, 4 stacked cards) wildly taller than the map (553px)
          and province panel (409.5px) beside it, with all 3 tops aligned
          but bottoms nowhere close — not the intended look either. Real
          fix: cap the gallery's OWN natural height with an internal
          scroll (below) so the row's tallest real entry is back to
          something reasonable (the map, ~553px), then let stretch align
          all 3 to that — the map and gallery now match exactly; the
          province panel (genuinely shorter real content) still doesn't
          reach that height, so it gets some real stretch space rather
          than none, but nowhere near the ~600px+ gap the original bug
          had. */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr,1fr,0.62fr]">
        {/* Candidate profiles gallery (2026-09-02) — replaces the
            Opportunity Matrix scatter plot in this exact slot; kept the
            same extra padding (this is still one of the app's two most
            substantive visuals, with the Territory Discovery map) —
            still hairline border, still no shadow, just more space. The
            scatter plot itself (ScatterPlot.tsx) is untouched and still
            in the codebase, just no longer imported/rendered anywhere on
            the primary Dashboard view. */}
        <Panel title="Candidate profiles — one real example per category" className="!p-7 flex flex-col" variant="instrument">
          {/* Scrollable card list (2026-09-02) — capped to roughly the
              map panel's own real height so the two align instead of the
              gallery dictating the whole row's height; all 4 real cards
              are still there, just scrollable rather than all forced
              into view at once. */}
          <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
            {galleryRows.map((row) => (
              <CandidateProfileCard key={row.candidate_id} row={row} />
            ))}
          </div>
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
        <Panel title="Real candidate locations + real Customary Territory Registry overlaps" variant="instrument">
          <DashboardMap candidates={candidates} />
          <PanelLink to="/territories">View in Territory Discovery</PanelLink>
        </Panel>
        <Panel title="Candidates by province (real, normalized)" variant="instrument">
          <ProvinceBreakdown candidates={candidates} />
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
      </div>

      {/* Top-5 lists and the richness/outreach bars — supporting
          context now, not the dashboard's main content. Top-5 columns get
          more width than the two bar-chart panels (not an even 4-way
          split) specifically so their score_label pills can keep BOTH
          real numbers beside them — never hiding a number just to fit a
          smaller demoted panel. */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr,1.3fr,1fr,1fr]">
        <Panel title="Top 5 by Opportunity" variant="instrument">
          <RankedList rows={topNeed} />
          <PanelLink to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, sortKey: "need_score", sortDir: "desc" }).toString()}`}>View all candidates</PanelLink>
        </Panel>
        <Panel title="Top 5 by Evidence Strength" variant="instrument">
          <RankedList rows={topCred} />
          <PanelLink to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, sortKey: "credibility_score", sortDir: "desc" }).toString()}`}>View all candidates</PanelLink>
        </Panel>
        <Panel title="Data richness" variant="instrument">
          {/* Donut + legend (2026-09-02 visual pass, replacing 3 bar rows) —
              same real per-category counts, just a more compact/scannable
              shape for exactly 3 categories that sum to the real total. */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <DonutChart
                size={80}
                segments={[
                  { value: richness.rich ?? 0, color: "#2f6d4f" },
                  { value: richness.corroborated ?? 0, color: "#245452" },
                  { value: richness.thin ?? 0, color: "#824623" },
                ]}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-[15px] font-bold text-stone-900">{total ? Math.round(((richness.rich ?? 0) / total) * 100) : 0}%</span>
                <span className="text-[7px] uppercase tracking-wide text-stone-400">rich</span>
              </div>
            </div>
            {/* min-w-0 required — a flex item otherwise won't shrink below
                its content's intrinsic width, which is exactly what
                `truncate` on the label below needs to ever kick in. */}
            <div className="min-w-0 flex-1 space-y-1.5 text-[12px]">
              {([
                ["rich", "#2f6d4f"],
                ["corroborated", "#245452"],
                ["thin", "#824623"],
              ] as const).map(([k, color]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate capitalize text-stone-600">{k}</span>
                  <span className="shrink-0 font-mono font-semibold text-stone-700">{richness[k] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
        <Panel title="Outreach status" variant="instrument">
          {/* Deliberately a plain dot+count list, not a donut (tried,
              reverted 2026-09-02): real outreach is 141/144 "not
              contacted" right now, so a donut ring renders as one almost-
              solid color with the other 4 real categories as invisible
              slivers — worse than the plain numbers at actually
              communicating the real breakdown. A donut works for Data
              richness above (a genuinely 3-way split); it doesn't here. */}
          <div className="space-y-2">
            {STATUS_OPTIONS.map((o) => (
              <Link
                key={o.value}
                to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, status: o.value }).toString()}`}
                className="flex items-center gap-2.5 text-[13px] hover:opacity-80"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_DOT_COLOR[o.value] }} />
                <span className="min-w-0 flex-1 truncate text-stone-600">{o.label}</span>
                <span className="shrink-0 font-mono font-semibold text-stone-700">{statusCounts[o.value]}</span>
              </Link>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] text-stone-500">Real, persisted state — set from a candidate's detail page, survives every data refresh.</p>
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
      </div>

      {/* Closing trust-badge row (2026-08-31 visual polish) — three real,
          already-true statements about this pipeline (see
          PROJECT_CONTEXT.md's design principles), not marketing copy
          invented for this row. */}
      <div className={`mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t pt-5 text-[12px] font-medium ${isDark ? "border-forest-800 text-stone-400" : "border-stone-300 text-stone-500"}`}>
        <span>Confirmed vs. inferred, always labeled</span>
        <span className="text-stone-400">·</span>
        <span>No LLM for scoring or matching</span>
        <span className="text-stone-400">·</span>
        <span>Opportunity and Evidence Strength scored independently</span>
      </div>
    </div>
  );
}

function RankedList({ rows }: { rows: CandidateListRow[] }) {
  return (
    <ol className="divide-y divide-stone-100">
      {rows.map((r, i) => (
        <li key={r.candidate_id} className="py-2">
          <Link to={`/candidates/${r.candidate_id}`} className="block hover:text-forest-700">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 w-4 shrink-0 font-mono text-[11px] text-stone-400">{i + 1}</span>
              <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-stone-800">{r.name}</div>
            </div>
            <div className="mt-1 pl-6">
              <ScoreLabelPill label={r.score_label} need={r.need_score} cred={r.credibility_score} />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

