import { Link } from "react-router-dom";
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
    <div className="px-6 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-stone-900">Dashboard</h1>
        <p className="mt-1 text-[13.5px] text-stone-500">Real, evidence-backed candidate discovery overview</p>
      </div>

      {/* Executive summary — the same real counts as the KPI cards below,
          framed as plain sentences rather than only cards, plus two real
          counts (resolved contact, has email) that don't have their own
          cards. Every number here is clickable and links to the exact
          filtered Candidates view it describes — never a static,
          unverifiable claim.

          2026-08-31 audit fix: this used to say "{resolvedContact} have a
          resolved contact ready for outreach" — false. has_resolved_contact
          is true for a Tier A registrant NAME with no email at all (83 of
          144 real candidates) — not ready for outreach in any real sense.
          Now states both numbers with their real, distinct meanings, and
          links each to its own accurately-filtered view (contactResolved=yes
          vs. hasEmail=yes are different filters — see candidateFilter.ts). */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p className="text-[14px] leading-relaxed text-stone-700">
          <SummaryLink to="/candidates">{total} real candidates</SummaryLink> are tracked in this pipeline.{" "}
          <SummaryLink to="/candidates?minNeed=70">{highNeed}</SummaryLink> show high need (need_score ≥ 70) and{" "}
          <SummaryLink to="/candidates?minCred=70">{highCred}</SummaryLink> show high credibility (credibility_score ≥ 70) — independent axes,
          never combined into one ranking. <SummaryLink to="/candidates?contactResolved=yes">{resolvedContact}</SummaryLink> have some contact on
          file (a registry name or an email), but only <SummaryLink to="/candidates?hasEmail=yes">{hasEmail}</SummaryLink> of those have a
          confidently-resolved email ready for outreach (plus{" "}
          <SummaryLink to="/candidates?lowConfidenceEmail=yes">{lowConfidenceEmail}</SummaryLink> more with a real email that's a weaker,
          lower-confidence match — worth a manual check before relying on it) — the rest are a name on file with nothing to send to. And{" "}
          <SummaryLink to="/candidates?compliance=approaching">{approachingDeadline}</SummaryLink> face an
          approaching Pasal 61 compliance deadline (amber/red).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Total candidates" value={total} sub="live from the API" to="/candidates" />
        <KpiCard label="High need (≥70)" value={highNeed} sub="real need_score, own axis" accent="clay" to="/candidates?minNeed=70" />
        <KpiCard label="High credibility (≥70)" value={highCred} sub="real credibility_score, own axis" accent="forest" to="/candidates?minCred=70" />
        <KpiCard
          label="Compliance deadline approaching"
          value={approachingDeadline}
          sub="Pasal 61 amber/red badge"
          accent="amber"
          to="/candidates?compliance=approaching"
        />
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
        <Panel title={`Opportunity matrix — need vs. credibility, all ${total} real candidates`}>
          <ScatterPlot candidates={candidates} />
        </Panel>
        <Panel title="Real candidate locations + real BRWA territory overlaps">
          <DashboardMap candidates={candidates} />
        </Panel>
        <Panel title="Candidates by province (real, normalized)">
          <ProvinceBreakdown candidates={candidates} />
        </Panel>
      </div>

      {/* Top-5 lists and the richness/outreach bars — supporting
          context now, not the dashboard's main content. Top-5 columns get
          more width than the two bar-chart panels (not an even 4-way
          split) specifically so their score_label pills can keep BOTH
          real numbers beside them — never hiding a number just to fit a
          smaller demoted panel. */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr,1.3fr,1fr,1fr]">
        <Panel title="Top 5 by need score">
          <RankedList rows={topNeed} />
        </Panel>
        <Panel title="Top 5 by credibility score">
          <RankedList rows={topCred} />
        </Panel>
        <Panel title="Data richness">
          <div className="space-y-2.5">
            {(["rich", "corroborated", "thin"] as const).map((k) => (
              <BarRow key={k} label={`${k} (${richness[k] ?? 0})`} value={richness[k] ?? 0} max={maxRichness} total={total} />
            ))}
          </div>
        </Panel>
        <Panel title="Outreach status">
          <div className="space-y-2.5">
            {STATUS_OPTIONS.map((o) => (
              <Link key={o.value} to={`/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, status: o.value }).toString()}`} className="block hover:opacity-80">
                <BarRow label={`${o.label} (${statusCounts[o.value]})`} value={statusCounts[o.value]} max={maxStatus} total={total} />
              </Link>
            ))}
          </div>
          <p className="mt-2.5 text-[12px] text-stone-500">Real, persisted state — set from a candidate's detail page, survives every data refresh.</p>
        </Panel>
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
        <div className="h-full rounded-full bg-forest-500" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right font-mono text-stone-500">{pct}%</span>
    </div>
  );
}
