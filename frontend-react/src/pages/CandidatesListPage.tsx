import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useCandidates } from "../lib/CandidatesContext";
import { CandidateTable } from "../components/CandidateTable";
import { KpiCard } from "../components/ui/KpiCard";
import { FilterSelect } from "../components/ui/FilterSelect";
import { STATUS_OPTIONS } from "../components/ui/StatusBadge";
import { applyCandidateFilter, filterParamsToSearchParams, searchParamsToFilterParams, type SortKey } from "../lib/candidateFilter";

export function CandidatesListPage() {
  const { candidates, error } = useCandidates();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = searchParamsToFilterParams(searchParams);

  const rows = useMemo(() => {
    if (!candidates) return [];
    return applyCandidateFilter(candidates, filterParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, searchParams.toString()]);

  function updateFilter(patch: Partial<typeof filterParams>) {
    setSearchParams(filterParamsToSearchParams({ ...filterParams, ...patch }), { replace: true });
  }

  function toggleSort(key: SortKey) {
    if (filterParams.sortKey !== key) updateFilter({ sortKey: key, sortDir: "desc" });
    else if (filterParams.sortDir === "desc") updateFilter({ sortDir: "asc" });
    else updateFilter({ sortKey: null, sortDir: "desc" });
  }

  // The exact query string every row links to — carries this list's
  // current filter/sort into the detail page, so prev/next there can
  // reconstruct the identical curated set instead of the raw 144.
  const currentQuery = searchParams.toString();

  // Threshold/flag filters (minNeed, minCred, complianceFlag,
  // contactResolved) arrive via a URL query — e.g. a click on the
  // Dashboard's "High need (≥70)" summary number — but have no dropdown
  // control here. Without a visible chip, a filtered-down table would
  // look like the full list with no explanation. Each chip is real
  // (labels the actual active param) and removable.
  const activeChips: { key: string; label: string; clear: Partial<typeof filterParams> }[] = [];
  if (filterParams.minNeed != null) activeChips.push({ key: "minNeed", label: `Need score ≥ ${filterParams.minNeed}`, clear: { minNeed: null } });
  if (filterParams.minCred != null) activeChips.push({ key: "minCred", label: `Credibility score ≥ ${filterParams.minCred}`, clear: { minCred: null } });
  if (filterParams.complianceFlag === "approaching") activeChips.push({ key: "compliance", label: "Compliance deadline approaching (amber/red)", clear: { complianceFlag: "" } });
  if (filterParams.contactResolved === "yes") activeChips.push({ key: "contactResolved", label: "Has resolved contact", clear: { contactResolved: "" } });
  if (filterParams.contactResolved === "no") activeChips.push({ key: "contactResolved", label: "No resolved contact", clear: { contactResolved: "" } });
  // province/brwaOverlap arrive from Territory Discovery's filter panel
  // and its "top territories"/BRWA-overlap links — same no-dropdown-here
  // reasoning as the threshold filters above.
  if (filterParams.province) activeChips.push({ key: "province", label: `Province: ${filterParams.province}`, clear: { province: "" } });
  if (filterParams.brwaOverlap === "yes") activeChips.push({ key: "brwaOverlap", label: "Confirmed BRWA overlap", clear: { brwaOverlap: "" } });
  if (filterParams.brwaOverlap === "no") activeChips.push({ key: "brwaOverlap", label: "No confirmed BRWA overlap", clear: { brwaOverlap: "" } });

  if (error) return <div className="px-5 py-4 text-clay-700">Failed to load candidates: {error}</div>;
  if (!candidates) return <div className="px-5 py-4 text-stone-400">Loading…</div>;

  const total = candidates.length;
  const highNeed = candidates.filter((r) => r.need_score >= 70).length;
  const highCred = candidates.filter((r) => r.credibility_score >= 70).length;
  const amberCompliance = candidates.filter((r) => r.compliance_badge === "amber").length;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-stone-50">
      {/* KPI row — real metric cards, not more table rows. */}
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-stone-200 bg-white px-5 py-4">
        <KpiCard label="Total candidates" value={total} />
        <KpiCard label="High need (≥70)" value={highNeed} accent="clay" />
        <KpiCard label="High credibility (≥70)" value={highCred} accent="forest" />
        <KpiCard label="Amber compliance" value={amberCompliance} accent="amber" />
      </div>

      {/* One real, working search (the old top-bar search box was
          decorative — no filter logic — so it was removed rather than
          kept as a second, non-functional control). Filter/sort state
          now lives in the URL (not local component state) specifically
          so it survives navigating into a candidate and back — see
          lib/candidateFilter.ts. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-forest-500 focus-within:ring-1 focus-within:ring-forest-200">
          <Search size={14} className="shrink-0 text-stone-400" />
          <input
            type="text"
            value={filterParams.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            placeholder="Search name or organization…"
            className="w-64 bg-transparent text-[13px] text-stone-700 placeholder:text-stone-400 focus:outline-none"
          />
        </div>
        <FilterSelect
          value={filterParams.richness}
          onChange={(v) => updateFilter({ richness: v })}
          placeholder="All richness"
          options={[{ value: "rich", label: "Rich" }, { value: "corroborated", label: "Corroborated" }, { value: "thin", label: "Thin" }]}
        />
        <FilterSelect value={filterParams.status} onChange={(v) => updateFilter({ status: v as typeof filterParams.status })} placeholder="All statuses" options={STATUS_OPTIONS} />
        <span className="ml-auto whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-500">
          {rows.length} of {candidates.length}
        </span>
      </div>

      {activeChips.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-forest-50/50 px-5 py-2.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">Active filter{activeChips.length > 1 ? "s" : ""}:</span>
          {activeChips.map((c) => (
            <button
              key={c.key}
              onClick={() => updateFilter(c.clear)}
              className="flex items-center gap-1.5 rounded-full border border-forest-300 bg-white px-2.5 py-1 text-[12px] font-medium text-forest-800 hover:bg-forest-50"
              title="Click to remove this filter"
            >
              {c.label}
              <span className="text-forest-500">×</span>
            </button>
          ))}
        </div>
      )}

      <CandidateTable
        rows={rows}
        currentQuery={currentQuery}
        sortKey={filterParams.sortKey}
        sortDir={filterParams.sortDir}
        onToggleSort={toggleSort}
      />
    </div>
  );
}
