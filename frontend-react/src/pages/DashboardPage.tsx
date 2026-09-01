import { Link } from "react-router-dom";
import { Users, Flame, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { SummaryLink } from "../components/ui/SummaryLink";
import { useCandidates } from "../lib/CandidatesContext";
import { Panel } from "../components/ui/Panel";
import { ScoreLabelPill } from "../components/ui/ScoreLabelPill";
import { KpiCard } from "../components/ui/KpiCard";
import { ScatterPlot } from "../components/ScatterPlot";
import { DashboardMap } from "../components/DashboardMap";
import { ProvinceBreakdown } from "../components/ProvinceBreakdown";
import { STATUS_OPTIONS } from "../components/ui/StatusBadge";
import { filterParamsToSearchParams, DEFAULT_FILTER_PARAMS } from "../lib/candidateFilter";
import type { CandidateListRow, CandidateStatusValue } from "../lib/types";

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
  const maxRichness = Math.max(...Object.values(richness), 1);

  // Real breakdown across all 5 outreach-status values (2026-08-28,
  // replacing the original binary contacted/not-contacted count) — same
  // BarRow treatment as Data richness, each row a real link to the exact
  // filtered Candidates view for that status.
  const statusCounts: Record<CandidateStatusValue, number> = { not_contacted: 0, contacted: 0, follow_up_needed: 0, done: 0, rejected: 0 };
  candidates.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  });
  const maxStatus = Math.max(...Object.values(statusCounts), 1);

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
          <KpiCard label="High Need" value={highNeed} sub="need_score ≥ 70" accent="clay" to="/candidates?minNeed=70" size="lg" icon={Flame} animateValue variant="instrument" />
          <KpiCard label="High Credibility" value={highCred} sub="credibility_score ≥ 70" to="/candidates?minCred=70" size="lg" icon={ShieldCheck} animateValue variant="instrument" />
          <KpiCard
            label="Compliance Risk"
            value={approachingDeadline}
            sub="Pasal 61 amber/red badge"
            to="/candidates?compliance=approaching"
            size="lg"
            icon={AlertTriangle}
            animateValue
            variant="instrument"
          />
        </div>

        <p className={`mt-5 text-[13px] ${isDark ? "text-stone-400" : "text-stone-500"}`}>Independent axes · never combined into one ranking · live from the registry</p>
      </div>

      {/* Contact-resolution detail — a slim, scannable line (2026-08-31
          polish pass), not the dense paragraph this used to be. Same 3
          real, distinct, clickable numbers as before, still each linking
          to its own accurately-filtered view — just no longer prose. The
          4th real number (resolvedContact, "any contact at all") isn't
          restated here since it's exactly nameOnlyNoEmail + hasEmail +
          lowConfidenceEmail — showing it too would be redundant, not a
          dropped fact. */}
      <div className={`mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border px-4 py-2.5 text-[13px] ${isDark ? "border-forest-800 bg-forest-900/40 text-stone-300" : "border-stone-300 bg-stone-100/70 text-stone-600"}`}>
        <span className={`font-medium ${isDark ? "text-stone-400" : "text-stone-500"}`}>Contact ready:</span>
        <SummaryLink to="/candidates?hasEmail=yes" muted>
          {hasEmail} confidently-resolved emails
        </SummaryLink>
        <span className="text-stone-400">·</span>
        <SummaryLink to="/candidates?lowConfidenceEmail=yes" muted>
          {lowConfidenceEmail} weaker matches
        </SummaryLink>
        <span className="text-stone-400">·</span>
        <SummaryLink
          to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, contactResolved: "yes", hasEmail: "no", lowConfidenceEmail: "no" }).toString()}`}
          muted
        >
          {nameOnlyNoEmail} named contacts, no email yet
        </SummaryLink>
      </div>

      {/* Phone/public-presence detail (2026-09-01, Tier C) — its own
          separate row, deliberately not merged into "Contact ready:"
          above: finding a phone number or a website doesn't change any
          candidate's email-readiness, so this must never read as an
          update to that line. "Also found:" framing, muted/secondary
          tone (text-stone-500 vs. the row above's stone-600) to keep it
          visually subordinate to the primary email-readiness metric. */}
      <div className={`mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border px-4 py-2.5 text-[13px] ${isDark ? "border-forest-900 bg-forest-950/40 text-stone-400" : "border-stone-200 bg-stone-50 text-stone-500"}`}>
        <span className={`font-medium ${isDark ? "text-stone-500" : "text-stone-400"}`}>Also found:</span>
        <SummaryLink to="/candidates?hasPhone=yes" muted>
          {hasPhone} reachable by phone/WhatsApp
        </SummaryLink>
        <span className="text-stone-400">·</span>
        <SummaryLink
          to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, hasPublicPresence: "yes", hasPhone: "no" }).toString()}`}
          muted
        >
          {publicPresenceOnly} more findable online (no direct contact)
        </SummaryLink>
      </div>

      {/* The dashboard's main content — the matrix and map get the bulk of
          the extra width, since they're what actually shows the shape of
          the real candidate pool at a glance. All real, already-computed
          data: no fabricated "trend over time" chart, since nothing in
          this pipeline tracks how a candidate's scores changed across past
          runs — that data doesn't exist. Province breakdown sits beside
          the map (not inside it) as its own real, normalized-from-real-data
          panel — see lib/provinceNormalize.ts. */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr,1fr,0.62fr]">
        <Panel title={`Opportunity matrix — need vs. credibility, all ${total} real candidates`} variant="instrument">
          <ScatterPlot candidates={candidates} />
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
        <Panel title="Real candidate locations + real BRWA territory overlaps" variant="instrument">
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
        <Panel title="Top 5 by need score" variant="instrument">
          <RankedList rows={topNeed} />
          <PanelLink to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, sortKey: "need_score", sortDir: "desc" }).toString()}`}>View all candidates</PanelLink>
        </Panel>
        <Panel title="Top 5 by credibility score" variant="instrument">
          <RankedList rows={topCred} />
          <PanelLink to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, sortKey: "credibility_score", sortDir: "desc" }).toString()}`}>View all candidates</PanelLink>
        </Panel>
        <Panel title="Data richness" variant="instrument">
          <div className="space-y-2.5">
            {(["rich", "corroborated", "thin"] as const).map((k) => (
              <BarRow key={k} label={`${k} (${richness[k] ?? 0})`} value={richness[k] ?? 0} max={maxRichness} total={total} />
            ))}
          </div>
          <PanelLink to="/candidates">View all candidates</PanelLink>
        </Panel>
        <Panel title="Outreach status" variant="instrument">
          <div className="space-y-2.5">
            {STATUS_OPTIONS.map((o) => (
              <Link key={o.value} to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, status: o.value }).toString()}`} className="block hover:opacity-80">
                <BarRow label={`${o.label} (${statusCounts[o.value]})`} value={statusCounts[o.value]} max={maxStatus} total={total} />
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
        <span>Fact vs. hypothesis, always labeled</span>
        <span className="text-stone-400">·</span>
        <span>No LLM for scoring or matching</span>
        <span className="text-stone-400">·</span>
        <span>Need and credibility scored independently</span>
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

function BarRow({ label, value, max, total }: { label: string; value: number; max: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      {/* w-[130px], not w-24 (96px) — measured: "Follow-up needed (2)"
          needs ~130px and was clipped at 96px, the same kind of silent
          overflow-hidden truncation caught elsewhere this session. Shared
          by both Data richness and Outreach status, so both get the fix. */}
      <span className="w-[130px] shrink-0 truncate text-stone-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
        {/* Muted stone, not forest-green (2026-08-31 visual-direction test) —
            same accent-reduction reasoning as PanelLink/ProvinceBreakdown. */}
        <div className="h-full rounded-full bg-stone-500" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-stone-500">{pct}%</span>
    </div>
  );
}
