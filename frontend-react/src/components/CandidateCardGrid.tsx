import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { ScoreLabelPill } from "./ui/ScoreLabelPill";
import { HonestState } from "./ui/HonestState";
import { StatusBadge } from "./ui/StatusBadge";
import { ActivityTypeBadges } from "./ui/ActivityTypeBadges";
import { ContactReadinessIndicator } from "./ui/ContactReadinessIndicator";
import { RowActions } from "./CandidateTable";
import { PROVINCE_NOT_AVAILABLE } from "../lib/provinceNormalize";
import { fmtScore } from "../lib/format";
import type { CandidateListRow } from "../lib/types";

/**
 * The Candidates list's card-grid view (2026-08-31) — same real fields,
 * same real filter/sort state, same real row actions as the table this
 * replaces on THIS page specifically. Tracked/Partnerships keeps
 * CandidateTable unchanged (a different real interaction — selecting a
 * row opens a status-editing panel below, which a card grid suits less
 * well), so this is a second real view, not a replacement of the shared
 * table component.
 *
 * Responsive: 3 columns wide, 2 at medium, 1 narrow — a real CSS grid,
 * not table-fixed, so it can never repeat the column-crushing bug found
 * and fixed on the table (nothing here has a fixed pixel width at all).
 */
export function CandidateCardGrid({ rows, currentQuery }: { rows: CandidateListRow[]; currentQuery: string }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <div
          key={r.candidate_id}
          onClick={() => navigate(`/candidates/${r.candidate_id}${currentQuery ? `?${currentQuery}` : ""}`)}
          // Visual pass (2026-09-03): rounded + soft-shadow card (per
          // .instrument-panel's own 2026-09-02 redefinition), warmer
          // forest hover accent now that the app has moved off the
          // "reserve color for one element" flat-instrument direction —
          // hover-lift's own shadow still does the "this is clickable"
          // signaling, this just adds a touch of warmth to match.
          className="instrument-panel hover-lift animate-row-in flex cursor-pointer flex-col border border-stone-200 bg-white p-5 transition-colors hover:border-forest-300 hover:bg-forest-50/20"
          style={{ animationDelay: `${Math.min(i * 15, 250)}ms` }}
        >
          <div className="truncate font-semibold text-stone-800" title={r.name}>
            {r.name}
          </div>
          <div className="truncate text-[12.5px] text-stone-500" title={r.org ?? undefined}>
            {r.org ?? "—"}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium text-stone-600">
              <MapPin size={11} />
              {r.province ?? <HonestState kind="no_data" label={PROVINCE_NOT_AVAILABLE} compact />}
            </span>
            <ScoreLabelPill label={r.score_label} need={r.need_score} cred={r.credibility_score} showNumbers={false} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-y border-stone-100 py-3">
            {/* Terminology pass (2026-09-02): "Need Score"/"Credibility
                Score" -> "Opportunity"/"Evidence Strength", the real
                technical field name kept as a hover title.
                Visual pass (2026-09-03): added the same progress-bar /
                5-dot-scale encoding as the Dashboard's ScoreStatCard, for
                one consistent "how these two axes look" language
                app-wide rather than a plain number here and a bar there. */}
            <div>
              <div title="Need score" className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Opportunity</div>
              <div className="mt-0.5 font-mono text-figure-sm tabular text-clay-600">
                {fmtScore(r.need_score)} <span className="text-[12px] font-normal text-stone-400">/100</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-clay-100">
                <div className="h-full rounded-full bg-clay-500" style={{ width: `${Math.max(0, Math.min(100, r.need_score))}%` }} />
              </div>
            </div>
            <div>
              <div title="Credibility score" className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Evidence Strength</div>
              <div className="mt-0.5 font-mono text-figure-sm tabular text-forest-600">
                {fmtScore(r.credibility_score)} <span className="text-[12px] font-normal text-stone-400">/100</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full ${i < Math.round(r.credibility_score / 20) ? "bg-forest-500" : "bg-forest-100"}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <ActivityTypeBadges
              activityType={{ categories: r.activity_categories, not_applicable: r.activity_not_applicable, not_applicable_reason: null }}
              compact
              maxVisible={2}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <ContactReadinessIndicator row={r} />
              <StatusBadge status={r.status} />
              <span className="truncate text-[11px] text-stone-400">{r.status_changed_at ? r.status_changed_at.slice(0, 10) : ""}</span>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <RowActions candidateId={r.candidate_id} canOutreach={r.has_resolved_contact} query={currentQuery} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
