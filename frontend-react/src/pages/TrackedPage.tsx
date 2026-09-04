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
import { useT, type StringKey } from "../lib/i18n";
import type { CandidateDetail, CandidateStatusValue } from "../lib/types";

// Maps the shared STATUS_OPTIONS' 5 values onto the existing status.*
// keys in i18n.ts (kept generic, not dash.*-prefixed, specifically so
// pages beyond Dashboard could reuse them) — a local KO mirror of
// StatusBadge.tsx's English labels, scoped to this page's own render
// call rather than editing that shared file (which the Candidates list/
// detail pages also depend on for their own, still-English rendering).
const STATUS_KEY: Record<CandidateStatusValue, StringKey> = {
  not_contacted: "status.notContacted",
  contacted: "status.contacted",
  follow_up_needed: "status.followUpNeeded",
  done: "status.done",
  rejected: "status.rejected",
};

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
  const { t } = useT();
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

  if (!candidates) return <div className="px-5 py-4 text-stone-400">{t("tracked.loading")}</div>;

  const trackedTotal = candidates.filter((r) => r.status !== "not_contacted").length;
  const counts: Record<CandidateStatusValue, number> = { not_contacted: 0, contacted: 0, follow_up_needed: 0, done: 0, rejected: 0 };
  candidates.forEach((r) => (counts[r.status] = (counts[r.status] ?? 0) + 1));

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col bg-stone-50">
      {/* Instrument-panel KPI row + accent restraint (2026-08-31 visual-
          direction rollout, approved on Dashboard/Candidates List/Territory
          Discovery first): "Contacted" and "Done" both used forest — two
          competing accents on one screen. Kept clay on "Follow-up needed"
          (matches Dashboard's High Need choice: the axis representing
          action still outstanding), muted the rest to ink, added the
          live-pulse dot to Tracked total. */}
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-stone-200 bg-white px-5 py-4">
        <KpiCard
          label={t("tracked.kpi.total")}
          value={trackedTotal}
          sub={t("tracked.kpi.total.sub").replace("{n}", String(candidates.length))}
          variant="instrument"
          live
        />
        <KpiCard label={t(STATUS_KEY.contacted)} value={counts.contacted} variant="instrument" />
        <KpiCard label={t(STATUS_KEY.follow_up_needed)} value={counts.follow_up_needed} accent="clay" variant="instrument" />
        <KpiCard label={t(STATUS_KEY.done)} value={counts.done} variant="instrument" />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-5 py-3">
        {candidateParam ? (
          <button onClick={clearCandidateFilter} className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-50">
            {t("tracked.filter.showingOne")} <span className="text-stone-500">×</span>
          </button>
        ) : (
          <FilterSelect
            value={filterParams.status}
            onChange={(v) => updateFilter({ status: v as typeof filterParams.status })}
            placeholder={t("tracked.filter.placeholder")}
            options={STATUS_OPTIONS.filter((o) => o.value !== "not_contacted").map((o) => ({ ...o, label: t(STATUS_KEY[o.value]) }))}
          />
        )}
        <span className="ml-auto whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-500">
          {t("tracked.badge.count")
            .replace("{shown}", String(rows.length))
            .replace("{total}", String(candidateParam ? 1 : trackedTotal))}
        </span>
      </div>

      {/* Paper background + topographic watermark scoped to the scrolling
          table area (2026-08-31 visual-direction rollout) — same "white
          instrument-control strip above the field document" relationship
          as Candidates List; the KPI/filter bars above stay white. */}
      <div className="topo-watermark bg-field-paper flex flex-1 flex-col">
        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-stone-400">
            {t("tracked.empty")}
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
      </div>

      {selectedId && (
        <div className="topo-watermark bg-field-paper shrink-0 border-t border-stone-300 p-6">
          {detailError && (
            <p className="text-[13px] text-clay-700">
              {t("tracked.detail.failedToLoad")} {detailError}
            </p>
          )}
          {!detailError && !selectedDetail && <p className="text-[13px] text-stone-400">{t("tracked.loading")}</p>}
          {selectedDetail && (
            // A bespoke card, not the shared Panel — this workspace is
            // meant to feel bigger/richer than a normal panel, a
            // deliberate one-off, not a change to Panel's own defaults
            // (which every other panel in the app still uses unchanged).
            // Instrument-panel treatment (2026-08-31 rollout): sharp
            // corners, hairline border, no shadow, matching every other
            // card in the app now.
            <div className="instrument-panel overflow-hidden border border-stone-300 bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-7 py-5">
                <div>
                  <h3 className="font-display text-[18px] font-semibold text-stone-900">{selectedDetail.identity.name}</h3>
                  <p className="mt-1 text-[13px] text-stone-500">{selectedDetail.identity.org ?? "—"}</p>
                </div>
                <Link to={`/candidates/${selectedDetail.candidate_id}`} className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-stone-700 hover:underline">
                  {t("tracked.detail.fullDetail")}
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
