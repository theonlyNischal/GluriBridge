import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useCandidates } from "../lib/CandidatesContext";
import { CandidateCardGrid } from "../components/CandidateCardGrid";
import { KpiCard } from "../components/ui/KpiCard";
import { FilterSelect } from "../components/ui/FilterSelect";
import { STATUS_OPTIONS } from "../components/ui/StatusBadge";
import { applyCandidateFilter, filterParamsToSearchParams, searchParamsToFilterParams } from "../lib/candidateFilter";

// Pagination (2026-08-31) — the card grid costs far more vertical space
// per candidate than the table it replaced (roughly 240px/card vs ~55px/
// row): the full unfiltered 144 at 3 columns is ~48 rows of cards, over
// 13 screen-heights of scroll. Not a performance problem (144 real DOM
// cards is trivial for any browser) — purely a "don't make someone
// scroll through 13 screens to browse everything" problem. 24 = a clean
// multiple of the 3-column grid (8 rows/page).
const PAGE_SIZE = 24;

// Card-grid layout (2026-08-31) has no column headers to click, so
// sorting moves to an explicit control here — same real sortKey/sortDir
// state candidateFilter.ts already owns, just a different UI surface for
// setting it. Opaque values (not sortKey names directly) since
// "need_score"/"credibility_score" both already contain underscores.
// Terminology pass (2026-09-02): "Need"/"Credibility" -> "Opportunity"/
// "Evidence Strength" in every label below — value keys unchanged
// (still drive the real need_score/credibility_score sort).
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "needDesc", label: "Opportunity (high to low)" },
  { value: "needAsc", label: "Opportunity (low to high)" },
  { value: "credDesc", label: "Evidence Strength (high to low)" },
  { value: "credAsc", label: "Evidence Strength (low to high)" },
];

function sortValueFor(sortKey: string | null, sortDir: string): string {
  if (!sortKey) return "";
  if (sortKey === "need_score") return sortDir === "asc" ? "needAsc" : "needDesc";
  return sortDir === "asc" ? "credAsc" : "credDesc";
}

function applySortValue(v: string): { sortKey: "need_score" | "credibility_score" | null; sortDir: "asc" | "desc" } {
  if (v === "needDesc") return { sortKey: "need_score", sortDir: "desc" };
  if (v === "needAsc") return { sortKey: "need_score", sortDir: "asc" };
  if (v === "credDesc") return { sortKey: "credibility_score", sortDir: "desc" };
  if (v === "credAsc") return { sortKey: "credibility_score", sortDir: "asc" };
  return { sortKey: null, sortDir: "desc" };
}

export function CandidatesListPage() {
  const { candidates, error } = useCandidates();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = searchParamsToFilterParams(searchParams);

  const rows = useMemo(() => {
    if (!candidates) return [];
    return applyCandidateFilter(candidates, filterParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, searchParams.toString()]);

  // Rebuilds the URL from filterParamsToSearchParams — deliberately drops
  // any existing "page" param (that function doesn't know about it),
  // which is exactly the wanted behavior: changing a filter/search/sort
  // resets to page 1 rather than leaving the user stranded on, say, page
  // 4 of a set that only has 1 page after the new filter applies.
  function updateFilter(patch: Partial<typeof filterParams>) {
    setSearchParams(filterParamsToSearchParams({ ...filterParams, ...patch }), { replace: true });
  }

  // Page navigation — preserves every current filter/sort param, only
  // ever touches "page".
  function goToPage(p: number) {
    const sp = filterParamsToSearchParams(filterParams);
    sp.set("page", String(p));
    setSearchParams(sp, { replace: true });
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  // Clamped, not trusted directly — a filter narrowing the set (or a
  // hand-edited/stale URL) can leave a "page" param pointing past the
  // real last page; falling back to the real last page rather than
  // rendering an empty grid with no explanation.
  const page = Math.min(Math.max(1, Number.isFinite(rawPage) ? rawPage : 1), totalPages);
  const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
  if (filterParams.minNeed != null) activeChips.push({ key: "minNeed", label: `Opportunity ≥ ${filterParams.minNeed}`, clear: { minNeed: null } });
  if (filterParams.minCred != null) activeChips.push({ key: "minCred", label: `Evidence Strength ≥ ${filterParams.minCred}`, clear: { minCred: null } });
  if (filterParams.complianceFlag === "approaching") activeChips.push({ key: "compliance", label: "Compliance deadline approaching (amber/red)", clear: { complianceFlag: "" } });
  if (filterParams.contactResolved === "yes") activeChips.push({ key: "contactResolved", label: "Has resolved contact", clear: { contactResolved: "" } });
  if (filterParams.contactResolved === "no") activeChips.push({ key: "contactResolved", label: "No resolved contact", clear: { contactResolved: "" } });
  // province/brwaOverlap arrive from Territory Discovery's filter panel
  // and its "top territories"/BRWA-overlap links — same no-dropdown-here
  // reasoning as the threshold filters above.
  if (filterParams.province) activeChips.push({ key: "province", label: `Province: ${filterParams.province}`, clear: { province: "" } });
  if (filterParams.brwaOverlap === "yes") activeChips.push({ key: "brwaOverlap", label: "Confirmed Customary Territory Overlap", clear: { brwaOverlap: "" } });
  if (filterParams.brwaOverlap === "no") activeChips.push({ key: "brwaOverlap", label: "No Confirmed Customary Territory Overlap", clear: { brwaOverlap: "" } });
  // hasEmail/lowConfidenceEmail/hasPhone/hasPublicPresence arrive from the
  // Dashboard's "Contact ready:"/"Also found:" summary numbers — a real
  // gap found and fixed 2026-09-02: these 4 params were landing here with
  // no chip at all (the count badge silently changed, same "looks like
  // the full list" problem the params above were already fixed for).
  if (filterParams.hasEmail === "yes") activeChips.push({ key: "hasEmail", label: "Has confidently-resolved email", clear: { hasEmail: "" } });
  if (filterParams.hasEmail === "no") activeChips.push({ key: "hasEmail", label: "No confidently-resolved email", clear: { hasEmail: "" } });
  if (filterParams.lowConfidenceEmail === "yes") activeChips.push({ key: "lowConfidenceEmail", label: "Has weaker email match", clear: { lowConfidenceEmail: "" } });
  if (filterParams.lowConfidenceEmail === "no") activeChips.push({ key: "lowConfidenceEmail", label: "No weaker email match", clear: { lowConfidenceEmail: "" } });
  if (filterParams.hasPhone === "yes") activeChips.push({ key: "hasPhone", label: "Reachable by phone/WhatsApp", clear: { hasPhone: "" } });
  if (filterParams.hasPhone === "no") activeChips.push({ key: "hasPhone", label: "No phone/WhatsApp on file", clear: { hasPhone: "" } });
  if (filterParams.hasPublicPresence === "yes") activeChips.push({ key: "hasPublicPresence", label: "Findable online (website/social)", clear: { hasPublicPresence: "" } });
  if (filterParams.hasPublicPresence === "no") activeChips.push({ key: "hasPublicPresence", label: "No public presence found", clear: { hasPublicPresence: "" } });

  if (error) return <div className="px-5 py-4 text-clay-700">Failed to load candidates: {error}</div>;
  if (!candidates) return <div className="px-5 py-4 text-stone-400">Loading…</div>;

  const total = candidates.length;
  const highNeed = candidates.filter((r) => r.need_score >= 70).length;
  const highCred = candidates.filter((r) => r.credibility_score >= 70).length;
  const amberCompliance = candidates.filter((r) => r.compliance_badge === "amber").length;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-stone-50">
      {/* KPI row — real metric cards, not more table rows. Visual-direction
          rollout (2026-08-31, approved on Dashboard first): instrument-panel
          cards, accent reserved for High need only (same axis-color choice
          as Dashboard), live-pulse dot on Total candidates. */}
      <div className="grid shrink-0 grid-cols-4 gap-3 border-b border-stone-200 bg-white px-5 py-4">
        <KpiCard label="Total candidates" value={total} variant="instrument" live />
        <KpiCard label="High opportunity (≥70)" value={highNeed} accent="clay" variant="instrument" />
        <KpiCard label="High evidence strength (≥70)" value={highCred} variant="instrument" />
        <KpiCard label="Amber compliance" value={amberCompliance} variant="instrument" />
      </div>

      {/* One real, working search (the old top-bar search box was
          decorative — no filter logic — so it was removed rather than
          kept as a second, non-functional control). Filter/sort state
          now lives in the URL (not local component state) specifically
          so it survives navigating into a candidate and back — see
          lib/candidateFilter.ts. */}
      {/* flex-wrap (2026-08-31 fix) — adding the Sort-by control as a 5th
          inline control (after richness/status/activity-type) pushed this
          row's total width past 1280px's available space, a real
          horizontal-overflow regression caught by re-running the standard
          1280/1440/1600 sweep, not assumed fixed by eye. Wrapping to a
          second line at narrow widths costs nothing real — every control
          stays fully visible and usable, just stacked. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-5 py-3">
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
          options={[{ value: "rich", label: "Strong Evidence" }, { value: "corroborated", label: "Corroborated" }, { value: "thin", label: "Limited Evidence" }]}
        />
        <FilterSelect value={filterParams.status} onChange={(v) => updateFilter({ status: v as typeof filterParams.status })} placeholder="All statuses" options={STATUS_OPTIONS} />
        <FilterSelect
          value={filterParams.activityCategory}
          onChange={(v) => updateFilter({ activityCategory: v })}
          placeholder="All activity types"
          options={[
            { value: "Peatland", label: "Peatland" },
            { value: "Reforestation", label: "Reforestation" },
            { value: "Social forestry", label: "Social forestry" },
            { value: "Conservation", label: "Conservation" },
            { value: "Improved Forest Management", label: "Improved Forest Management" },
            { value: "unclassified", label: "Needs Classification" },
            { value: "not_applicable", label: "Not Relevant" },
          ]}
        />
        <FilterSelect
          value={sortValueFor(filterParams.sortKey, filterParams.sortDir)}
          onChange={(v) => updateFilter(applySortValue(v))}
          placeholder="Default order"
          options={SORT_OPTIONS}
        />
        <span className="ml-auto whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-500">
          {rows.length} of {candidates.length}
        </span>
      </div>

      {activeChips.length > 0 && (
        // Muted stone, not forest-green (2026-08-31 accent-restraint
        // rollout) — a filter chip is a state indicator, not a place that
        // needs its own competing accent color.
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-100/50 px-5 py-2.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">Active filter{activeChips.length > 1 ? "s" : ""}:</span>
          {activeChips.map((c) => (
            <button
              key={c.key}
              onClick={() => updateFilter(c.clear)}
              className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-50"
              title="Click to remove this filter"
            >
              {c.label}
              <span className="text-stone-500">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Paper background + topographic watermark scoped to the scrolling
          content area only (2026-08-31 visual-direction rollout) — the
          toolbar/filter bars above stay white, reading as a fixed
          instrument-control strip above the "field document" underneath,
          same relationship as the app shell's own white header sitting
          above this page's body. */}
      <div className="topo-watermark bg-field-paper flex-1 overflow-auto">
        <CandidateCardGrid rows={pagedRows} currentQuery={currentQuery} />
      </div>

      {/* Pagination footer — always visible (shrink-0, outside the
          scrolling card area), never scrolls away. Only rendered when
          there's real pagination to do (a single-page filtered set gets
          no confusing "Page 1 of 1" clutter). */}
      {rows.length > 0 && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-5 py-3">
          <span className="text-[12.5px] text-stone-500">
            Showing <span className="font-semibold text-stone-700">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)}</span> of{" "}
            <span className="font-semibold text-stone-700">{rows.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => goToPage(p)}
                // Ink, not forest-green (2026-08-31 accent-restraint
                // rollout) — "current page" is state, not a place that
                // needs a competing accent color on this screen.
                className={`h-8 w-8 rounded-md text-[12.5px] font-medium ${p === page ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
