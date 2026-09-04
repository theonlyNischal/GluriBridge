import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useCandidates } from "../lib/CandidatesContext";
import { CandidateCardGrid } from "../components/CandidateCardGrid";
import { KpiCard } from "../components/ui/KpiCard";
import { FilterSelect } from "../components/ui/FilterSelect";
import { STATUS_OPTIONS } from "../components/ui/StatusBadge";
import { applyCandidateFilter, filterParamsToSearchParams, searchParamsToFilterParams } from "../lib/candidateFilter";
import { useT, type StringKey } from "../lib/i18n";
import type { ActivityCategory, CandidateStatusValue } from "../lib/types";

// Opt-in Korean mirrors (2026-09-04, EN/KO toggle) of StatusBadge.tsx's
// STATUS_LABEL and the 5 real activity_categories values — same pattern
// as DashboardPage.tsx's STATUS_LABEL_KEY / ProjectTypeBreakdown.tsx's
// CATEGORY_KEY: those shared source-of-truth maps stay English-only and
// untouched, this page-local lookup is additive, used only when
// lang === "ko" below.
const STATUS_LABEL_KEY: Record<CandidateStatusValue, StringKey> = {
  not_contacted: "status.notContacted",
  contacted: "status.contacted",
  follow_up_needed: "status.followUpNeeded",
  done: "status.done",
  rejected: "status.rejected",
};

const ACTIVITY_LABEL_KEY: Record<ActivityCategory, StringKey> = {
  Reforestation: "activity.reforestation",
  "Social forestry": "activity.socialForestry",
  Conservation: "activity.conservation",
  Peatland: "activity.peatland",
  "Improved Forest Management": "activity.improvedForestManagement",
};

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

// Opt-in Korean mirror of SORT_OPTIONS' labels above (2026-09-04) — same
// additive, lang==="ko"-only pattern as STATUS_LABEL_KEY/ACTIVITY_LABEL_KEY.
const SORT_LABEL_KEY: Record<string, StringKey> = {
  needDesc: "candidatesList.sort.needDesc",
  needAsc: "candidatesList.sort.needAsc",
  credDesc: "candidatesList.sort.credDesc",
  credAsc: "candidatesList.sort.credAsc",
};

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
  const { t, lang } = useT();
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
  if (filterParams.minNeed != null) activeChips.push({ key: "minNeed", label: `${t("score.opportunity")} ≥ ${filterParams.minNeed}`, clear: { minNeed: null } });
  if (filterParams.minCred != null) activeChips.push({ key: "minCred", label: `${t("score.evidence")} ≥ ${filterParams.minCred}`, clear: { minCred: null } });
  if (filterParams.complianceFlag === "approaching") activeChips.push({ key: "compliance", label: t("candidatesList.chip.complianceApproaching"), clear: { complianceFlag: "" } });
  if (filterParams.complianceFlag === "amber") activeChips.push({ key: "compliance", label: t("candidatesList.chip.amberBadge"), clear: { complianceFlag: "" } });
  if (filterParams.contactResolved === "yes") activeChips.push({ key: "contactResolved", label: t("candidatesList.chip.hasResolvedContact"), clear: { contactResolved: "" } });
  if (filterParams.contactResolved === "no") activeChips.push({ key: "contactResolved", label: t("candidatesList.chip.noResolvedContact"), clear: { contactResolved: "" } });
  // province/brwaOverlap arrive from Territory Discovery's filter panel
  // and its "top territories"/BRWA-overlap links — same no-dropdown-here
  // reasoning as the threshold filters above. The province NAME itself
  // (filterParams.province) is real data and stays untranslated — only
  // the "Province:" label word passes through t().
  if (filterParams.province) activeChips.push({ key: "province", label: `${t("candidatesList.chip.provincePrefix")} ${filterParams.province}`, clear: { province: "" } });
  if (filterParams.brwaOverlap === "yes") activeChips.push({ key: "brwaOverlap", label: t("candidatesList.chip.brwaOverlapYes"), clear: { brwaOverlap: "" } });
  if (filterParams.brwaOverlap === "no") activeChips.push({ key: "brwaOverlap", label: t("candidatesList.chip.brwaOverlapNo"), clear: { brwaOverlap: "" } });
  // hasEmail/lowConfidenceEmail/hasPhone/hasPublicPresence arrive from the
  // Dashboard's "Contact ready:"/"Also found:" summary numbers — a real
  // gap found and fixed 2026-09-02: these 4 params were landing here with
  // no chip at all (the count badge silently changed, same "looks like
  // the full list" problem the params above were already fixed for).
  if (filterParams.hasEmail === "yes") activeChips.push({ key: "hasEmail", label: t("candidatesList.chip.hasEmailYes"), clear: { hasEmail: "" } });
  if (filterParams.hasEmail === "no") activeChips.push({ key: "hasEmail", label: t("candidatesList.chip.hasEmailNo"), clear: { hasEmail: "" } });
  if (filterParams.lowConfidenceEmail === "yes") activeChips.push({ key: "lowConfidenceEmail", label: t("candidatesList.chip.lowConfidenceEmailYes"), clear: { lowConfidenceEmail: "" } });
  if (filterParams.lowConfidenceEmail === "no") activeChips.push({ key: "lowConfidenceEmail", label: t("candidatesList.chip.lowConfidenceEmailNo"), clear: { lowConfidenceEmail: "" } });
  if (filterParams.hasPhone === "yes") activeChips.push({ key: "hasPhone", label: t("candidatesList.chip.hasPhoneYes"), clear: { hasPhone: "" } });
  if (filterParams.hasPhone === "no") activeChips.push({ key: "hasPhone", label: t("candidatesList.chip.hasPhoneNo"), clear: { hasPhone: "" } });
  if (filterParams.hasPublicPresence === "yes") activeChips.push({ key: "hasPublicPresence", label: t("candidatesList.chip.hasPresenceYes"), clear: { hasPublicPresence: "" } });
  if (filterParams.hasPublicPresence === "no") activeChips.push({ key: "hasPublicPresence", label: t("candidatesList.chip.hasPresenceNo"), clear: { hasPublicPresence: "" } });

  if (error) return <div className="px-5 py-4 text-clay-700">{t("candidatesList.errorPrefix")} {error}</div>;
  if (!candidates) return <div className="px-5 py-4 text-stone-400">{t("candidatesList.loading")}</div>;

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
        {/* Clickable (2026-09-04), matching the Dashboard's own KPI row —
            each `to` clears/sets ONLY its own filter, never stacking with
            whatever's currently active, since these numbers are always
            computed off the full unfiltered `candidates` list above, not
            the filtered `rows` the table itself renders. Amber links to
            complianceFlag=amber (strictly amber), NOT the "approaching"
            value the Dashboard's own compliance card uses (amber OR red)
            — this card has always counted amber only, so its link has to
            match that same narrower definition, or the rows you'd land on
            would outnumber what the card just showed you. */}
        <KpiCard label={t("candidatesList.kpi.total")} value={total} variant="instrument" live to="/candidates" />
        <KpiCard label={t("candidatesList.kpi.highOpp")} value={highNeed} accent="clay" variant="instrument" to="/candidates?minNeed=70" />
        <KpiCard label={t("candidatesList.kpi.highEvid")} value={highCred} variant="instrument" to="/candidates?minCred=70" />
        <KpiCard label={t("candidatesList.kpi.amberCompliance")} value={amberCompliance} variant="instrument" to="/candidates?compliance=amber" />
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
            placeholder={t("candidatesList.searchPlaceholder")}
            className="w-64 bg-transparent text-[13px] text-stone-700 placeholder:text-stone-400 focus:outline-none"
          />
        </div>
        <FilterSelect
          value={filterParams.richness}
          onChange={(v) => updateFilter({ richness: v })}
          placeholder={t("candidatesList.filter.allRichness")}
          options={[
            { value: "rich", label: t("candidatesList.richness.strong") },
            { value: "corroborated", label: t("candidatesList.richness.corroborated") },
            { value: "thin", label: t("candidatesList.richness.thin") },
          ]}
        />
        <FilterSelect
          value={filterParams.status}
          onChange={(v) => updateFilter({ status: v as typeof filterParams.status })}
          placeholder={t("candidatesList.filter.allStatuses")}
          options={
            lang === "ko"
              ? STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(STATUS_LABEL_KEY[o.value]) }))
              : STATUS_OPTIONS
          }
        />
        <FilterSelect
          value={filterParams.activityCategory}
          onChange={(v) => updateFilter({ activityCategory: v })}
          placeholder={t("candidatesList.filter.allActivityTypes")}
          options={[
            { value: "Peatland", label: lang === "ko" ? t(ACTIVITY_LABEL_KEY.Peatland) : "Peatland" },
            { value: "Reforestation", label: lang === "ko" ? t(ACTIVITY_LABEL_KEY.Reforestation) : "Reforestation" },
            { value: "Social forestry", label: lang === "ko" ? t(ACTIVITY_LABEL_KEY["Social forestry"]) : "Social forestry" },
            { value: "Conservation", label: lang === "ko" ? t(ACTIVITY_LABEL_KEY.Conservation) : "Conservation" },
            {
              value: "Improved Forest Management",
              label: lang === "ko" ? t(ACTIVITY_LABEL_KEY["Improved Forest Management"]) : "Improved Forest Management",
            },
            { value: "unclassified", label: lang === "ko" ? t("activity.unclassified") : "Needs Classification" },
            { value: "not_applicable", label: lang === "ko" ? t("activity.notApplicable") : "Not Relevant" },
          ]}
        />
        <FilterSelect
          value={sortValueFor(filterParams.sortKey, filterParams.sortDir)}
          onChange={(v) => updateFilter(applySortValue(v))}
          placeholder={t("candidatesList.filter.defaultOrder")}
          options={
            lang === "ko"
              ? SORT_OPTIONS.map((o) => ({ value: o.value, label: t(SORT_LABEL_KEY[o.value]) }))
              : SORT_OPTIONS
          }
        />
        <span className="ml-auto whitespace-nowrap rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-500">
          {rows.length} {t("candidatesList.countOf")} {candidates.length}
        </span>
      </div>

      {activeChips.length > 0 && (
        // Muted stone, not forest-green (2026-08-31 accent-restraint
        // rollout) — a filter chip is a state indicator, not a place that
        // needs its own competing accent color.
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-100/50 px-5 py-2.5">
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">
            {t(activeChips.length > 1 ? "candidatesList.activeFilters" : "candidatesList.activeFilter")}
          </span>
          {activeChips.map((c) => (
            <button
              key={c.key}
              onClick={() => updateFilter(c.clear)}
              className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-50"
              title={t("candidatesList.chip.removeTooltip")}
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
        <CandidateCardGrid rows={pagedRows} currentQuery={currentQuery} lang={lang} />
      </div>

      {/* Pagination footer — always visible (shrink-0, outside the
          scrolling card area), never scrolls away. Only rendered when
          there's real pagination to do (a single-page filtered set gets
          no confusing "Page 1 of 1" clutter). */}
      {rows.length > 0 && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-5 py-3">
          <span className="text-[12.5px] text-stone-500">
            {t("candidatesList.pagination.showing")} <span className="font-semibold text-stone-700">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)}</span>{" "}
            {t("candidatesList.countOf")} <span className="font-semibold text-stone-700">{rows.length}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-md border border-stone-300 px-2.5 py-1.5 text-[12.5px] font-medium text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> {t("candidatesList.pagination.prev")}
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
              {t("candidatesList.pagination.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
