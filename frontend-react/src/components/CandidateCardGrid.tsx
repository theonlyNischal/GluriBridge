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
          className="hover-lift animate-row-in flex cursor-pointer flex-col rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-forest-300 hover:bg-forest-50/30"
          style={{ animationDelay: `${Math.min(i * 15, 250)}ms` }}
        >
          <div className="truncate font-semibold text-stone-800" title={r.name}>
            {r.name}
          </div>
          <div className="truncate text-[12.5px] text-stone-500" title={r.org ?? undefined}>
            {r.org ?? "—"}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
              <MapPin size={11} />
              {r.province ?? <HonestState kind="no_data" label={PROVINCE_NOT_AVAILABLE} compact />}
            </span>
            <ScoreLabelPill label={r.score_label} need={r.need_score} cred={r.credibility_score} showNumbers={false} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-y border-stone-100 py-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Need Score</div>
              <div className="mt-0.5 font-mono text-figure-sm tabular text-clay-600">
                {fmtScore(r.need_score)} <span className="text-[12px] font-normal text-stone-400">/100</span>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Credibility Score</div>
              <div className="mt-0.5 font-mono text-figure-sm tabular text-forest-600">
                {fmtScore(r.credibility_score)} <span className="text-[12px] font-normal text-stone-400">/100</span>
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
