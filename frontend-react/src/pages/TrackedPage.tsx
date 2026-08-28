import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useCandidates } from "../lib/CandidatesContext";
import { CandidateTable } from "../components/CandidateTable";
import { StatusEditor } from "../components/StatusEditor";
import { KpiCard } from "../components/ui/KpiCard";
import { FilterSelect } from "../components/ui/FilterSelect";
import { STATUS_OPTIONS } from "../components/ui/StatusBadge";
import { applyCandidateFilter, filterParamsToSearchParams, searchParamsToFilterParams, type SortKey } from "../lib/candidateFilter";
import type { CandidateDetail, CandidateStatusValue } from "../lib/types";

/**
 * A filtered Candidates view, preset to non-default status — reuses the
 * exact same CandidateTable/filter machinery as the Candidates page (per
 * the 2026-08-28 status-tracking scope decision: a flat filtered list,
 * not a from-scratch kanban/pipeline board). What's genuinely new here:
 * the preset "status != not_contacted" condition, its own KPI header, and
 * (2026-08-28 restructure) the full status selector/note/history editor,
 * shown for whichever row is selected — moved here wholesale from the
 * candidate detail page, which now only links in via ?candidate={id}
 * rather than duplicating the editor.
 */
export function TrackedPage() {
  const { candidates, updateStatus } = useCandidates();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = searchParamsToFilterParams(searchParams);
  const candidateParam = searchParams.get("candidate");

  const [selectedId, setSelectedId] = useState<string | null>(candidateParam);
  const [selectedDetail, setSelectedDetail] = useState<CandidateDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // A deep link from the detail page's "View tracking →" always selects
  // that candidate, even across re-renders where this page instance is
  // reused (react-router doesn't remount for a query-only change).
  useEffect(() => {
    if (candidateParam) setSelectedId(candidateParam);
  }, [candidateParam]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    setDetailError(null);
    api
      .getCandidate(selectedId)
      .then(setSelectedDetail)
      .catch((e) => setDetailError(String(e.message ?? e)));
  }, [selectedId]);

  // The default view is every real candidate with a non-default status.
  // A ?candidate={id} deep link (from the detail page, for a candidate
  // that may still be status=not_contacted) overrides that — the point of
  // following that link is to START tracking it, so it must be visible
  // here regardless of its current status, not filtered out for not
  // being "tracked" yet.
  const baseRows = useMemo(() => {
    if (!candidates) return [];
    if (candidateParam) return candidates.filter((r) => r.candidate_id === candidateParam);
    return candidates.filter((r) => r.status !== "not_contacted");
  }, [candidates, candidateParam]);

  const rows = useMemo(() => {
    return applyCandidateFilter(baseRows, filterParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, searchParams.toString()]);

  function updateFilter(patch: Partial<typeof filterParams>) {
    setSearchParams(filterParamsToSearchParams({ ...filterParams, ...patch }), { replace: true });
  }

  function toggleSort(key: SortKey) {
    if (filterParams.sortKey !== key) updateFilter({ sortKey: key, sortDir: "desc" });
    else if (filterParams.sortDir === "desc") updateFilter({ sortDir: "asc" });
    else updateFilter({ sortKey: null, sortDir: "desc" });
  }

  function clearCandidateFilter() {
    const sp = new URLSearchParams(searchParams);
    sp.delete("candidate");
    setSearchParams(sp, { replace: true });
  }

  const currentQuery = searchParams.toString();

  if (!candidates) return <div className="px-5 py-4 text-stone-400">Loading…</div>;

  const trackedTotal = candidates.filter((r) => r.status !== "not_contacted").length;
  const counts: Record<CandidateStatusValue, number> = { not_contacted: 0, contacted: 0, follow_up_needed: 0, done: 0, rejected: 0 };
  candidates.forEach((r) => (counts[r.status] = (counts[r.status] ?? 0) + 1));

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col bg-stone-50">
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-stone-200 bg-white px-5 py-4">
        <KpiCard label="Tracked total" value={trackedTotal} sub={`of ${candidates.length} candidates`} />
        <KpiCard label="Contacted" value={counts.contacted} accent="forest" />
        <KpiCard label="Follow-up needed" value={counts.follow_up_needed} accent="clay" />
        <KpiCard label="Done" value={counts.done} accent="forest" />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-5 py-3">
        {candidateParam ? (
          <button onClick={clearCandidateFilter} className="flex items-center gap-1.5 rounded-full border border-forest-300 bg-white px-2.5 py-1 text-[12px] font-medium text-forest-800 hover:bg-forest-50">
            Showing 1 candidate <span className="text-forest-500">×</span>
          </button>
        ) : (
          <FilterSelect
            value={filterParams.status}
            onChange={(v) => updateFilter({ status: v as typeof filterParams.status })}
            placeholder="All tracked statuses"
            options={STATUS_OPTIONS.filter((o) => o.value !== "not_contacted")}
          />
        )}
        <span className="ml-auto whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-500">
          {rows.length} of {candidateParam ? 1 : trackedTotal} tracked
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[13px] text-stone-400">
          No candidates have a status set yet — select one below to start tracking it.
        </div>
      ) : (
        <CandidateTable
          rows={rows}
          currentQuery={currentQuery}
          sortKey={filterParams.sortKey}
          sortDir={filterParams.sortDir}
          onToggleSort={toggleSort}
          onRowClick={setSelectedId}
          selectedId={selectedId}
        />
      )}

      {selectedId && (
        <div className="shrink-0 border-t border-stone-200 bg-stone-100/60 p-6">
          {detailError && <p className="text-[13px] text-clay-700">Failed to load: {detailError}</p>}
          {!detailError && !selectedDetail && <p className="text-[13px] text-stone-400">Loading…</p>}
          {selectedDetail && (
            // A bespoke card, not the shared Panel — this workspace is
            // meant to feel bigger/richer than a normal panel, a
            // deliberate one-off, not a change to Panel's own defaults
            // (which every other panel in the app still uses unchanged).
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-7 py-5">
                <div>
                  <h3 className="font-display text-[18px] font-semibold text-stone-900">{selectedDetail.identity.name}</h3>
                  <p className="mt-1 text-[13px] text-stone-500">{selectedDetail.identity.org ?? "—"}</p>
                </div>
                <Link to={`/candidates/${selectedDetail.candidate_id}`} className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-forest-700 hover:underline">
                  Full detail →
                </Link>
              </div>
              <div className="p-7">
                <StatusEditor
                  candidateId={selectedDetail.candidate_id}
                  status={selectedDetail.status.status}
                  note={selectedDetail.status.note}
                  history={selectedDetail.status.history}
                  onSaved={(updated) => {
                    setSelectedDetail((prev) => (prev ? { ...prev, status: updated } : prev));
                    updateStatus(selectedDetail.candidate_id, updated.status, updated.status_changed_at);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
