import { useNavigate } from "react-router-dom";
import { Eye, FileText, Send } from "lucide-react";
import { ScoreLabelPill } from "./ui/ScoreLabelPill";
import { HonestState } from "./ui/HonestState";
import { StatusBadge } from "./ui/StatusBadge";
import { PROVINCE_NOT_AVAILABLE } from "../lib/provinceNormalize";
import { fmtScore } from "../lib/format";
import type { CandidateListRow } from "../lib/types";
import type { SortKey, SortDir } from "../lib/candidateFilter";

/**
 * THE single real candidates table — used by the Candidates list page and
 * the new Tracked page alike (2026-08-28), so "reusing the existing table/
 * row/actions component" is literal, not just similar-looking markup
 * copy-pasted twice. Both pages own their own filter bar/KPI header above
 * this; this component only owns the rows it's given. Sort state/handling
 * is owned by the caller (each page's URL-driven filterParams) and passed
 * through as props, so both pages' sortable Need/Credibility headers stay
 * wired to the exact same real column values.
 *
 * `onRowClick`/`selectedId` are optional — omitted, a row click navigates
 * to the candidate detail page (Candidates list's behavior, unchanged).
 * Tracked passes `onRowClick` to select a row in place (opening its
 * StatusEditor below the table) instead of navigating away, since this is
 * the one page where "manage this candidate's tracking" is the point of
 * being here at all.
 */
export function CandidateTable({
  rows,
  currentQuery,
  sortKey,
  sortDir,
  onToggleSort,
  onRowClick,
  selectedId,
}: {
  rows: CandidateListRow[];
  currentQuery: string;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  onRowClick?: (id: string) => void;
  selectedId?: string | null;
}) {
  const navigate = useNavigate();
  function arrow(key: SortKey) {
    if (sortKey !== key) return null;
    return <span className="ml-1 text-forest-600">{sortDir === "desc" ? "▼" : "▲"}</span>;
  }
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse text-left text-[13px]">
        <colgroup>
          <col className="w-10" />
          <col className="w-[17%]" />
          <col className="w-[13%]" />
          {/* 320px — measured: "Opportunity  need 100.0 / cred 41.2" needs
              ~311px and was silently clipped (overflow-hidden, no
              ellipsis) at narrower widths; a real bug caught while
              re-measuring cell widths for the Province badge, fixed
              alongside it. */}
          <col className="w-[320px]" />
          <col className="w-[140px]" />
          {/* 132px, not 112px — "Follow-up needed" (the longest status
              label) measured at ~127px and was clipped at 112; caught the
              same way as the Signal-column bug above, by measuring real
              cell widths rather than eyeballing it. */}
          <col className="w-[132px]" />
          <col className="w-[60px]" />
          <col className="w-[90px]" />
          <col className="w-[132px]" />
        </colgroup>
        <thead className="sticky top-0 z-[1] border-b-2 border-stone-300 bg-stone-100">
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
            <th className="whitespace-nowrap px-3 py-2.5"></th>
            <th className="whitespace-nowrap px-3 py-2.5">Project name</th>
            <th className="whitespace-nowrap px-3 py-2.5">Organization</th>
            <th className="whitespace-nowrap px-3 py-2.5">Signal</th>
            <th className="whitespace-nowrap px-3 py-2.5">Province</th>
            <th className="whitespace-nowrap px-3 py-2.5">Status</th>
            <th className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hover:text-forest-700" onClick={() => onToggleSort("need_score")}>
              Need{arrow("need_score")}
            </th>
            <th className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hover:text-forest-700" onClick={() => onToggleSort("credibility_score")}>
              Credibility{arrow("credibility_score")}
            </th>
            <th className="whitespace-nowrap px-3 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map((r, i) => (
            <tr
              key={r.candidate_id}
              onClick={() => (onRowClick ? onRowClick(r.candidate_id) : navigate(`/candidates/${r.candidate_id}${currentQuery ? `?${currentQuery}` : ""}`))}
              className={`cursor-pointer border-b border-stone-200 transition-colors hover:bg-forest-50/70 ${selectedId === r.candidate_id ? "bg-forest-50" : ""}`}
            >
              <td className="whitespace-nowrap px-2 py-3 text-[11px] text-stone-400">{i + 1}</td>
              <td className="truncate px-3 py-3 font-semibold text-stone-800" title={r.name}>
                {r.name}
              </td>
              <td className="truncate px-3 py-3 text-stone-500" title={r.org ?? undefined}>
                {r.org ?? "—"}
              </td>
              <td className="overflow-hidden px-3 py-3">
                <ScoreLabelPill label={r.score_label} need={r.need_score} cred={r.credibility_score} />
              </td>
              <td className="truncate px-3 py-3 text-stone-600" title={r.province ?? undefined}>
                {r.province ?? <HonestState kind="no_data" label={PROVINCE_NOT_AVAILABLE} compact />}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-3 font-mono tabular text-stone-700">{fmtScore(r.need_score)}</td>
              <td className="px-3 py-3 font-mono tabular text-stone-700">{fmtScore(r.credibility_score)}</td>
              <td className="px-2 py-3">
                <RowActions candidateId={r.candidate_id} canOutreach={r.has_resolved_contact} query={currentQuery} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ candidateId, canOutreach, query }: { candidateId: string; canOutreach: boolean; query: string }) {
  const navigate = useNavigate();
  function go(tab?: string) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      const sp = new URLSearchParams(query);
      if (tab) sp.set("tab", tab);
      const qs = sp.toString();
      navigate(`/candidates/${candidateId}${qs ? `?${qs}` : ""}`);
    };
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={go()} title="View candidate" className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-forest-700">
        <Eye size={15} />
      </button>
      {/* Dossier generation always succeeds (build_dossier() has no
          rejection case — even a thin candidate gets an honest, hedged
          dossier) so this is never disabled. Navigates to the real
          Dossier tab, not a placeholder preview. */}
      <button onClick={go("dossier")} title="Generate dossier" className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-forest-700">
        <FileText size={15} />
      </button>
      {/* Real feature, real constraint: outreach genuinely can't be
          generated for a candidate with no resolved contact at all
          (recipient_status === insufficient_contact — has_resolved_contact
          is exactly that same condition, computed by the backend, not
          guessed here). Disabled + a real explanation, never a silent
          no-op click. */}
      <button
        onClick={canOutreach ? go("outreach") : (e) => e.stopPropagation()}
        disabled={!canOutreach}
        title={canOutreach ? "Add to outreach" : "No contact resolved for this candidate yet — needs manual lookup before outreach can be generated"}
        className={`rounded p-1.5 ${canOutreach ? "text-stone-400 hover:bg-stone-100 hover:text-forest-700" : "cursor-not-allowed text-stone-200"}`}
      >
        <Send size={15} />
      </button>
    </div>
  );
}
