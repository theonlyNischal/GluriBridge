import { Link } from "react-router-dom";
import { filterParamsToSearchParams, DEFAULT_FILTER_PARAMS } from "../lib/candidateFilter";
import type { ActivityCategory, CandidateListRow } from "../lib/types";

const CATEGORIES: ActivityCategory[] = ["Reforestation", "Social forestry", "Conservation", "Peatland", "Improved Forest Management"];

/**
 * Real project-type breakdown (2026-09-03, added on a mentor's
 * suggestion at the hackathon) — same real, already-tracked
 * activity_categories field the Candidates-list filter and the card
 * grid's badges already use, not a new taxonomy invented for this
 * panel. Same real bar-list + click-through-to-filtered-view pattern
 * as ProvinceBreakdown, right next to it, so the two "what's actually
 * in this pipeline" panels (where / what kind) read consistently.
 *
 * Deliberately NOT a donut: a candidate can carry more than one real
 * category (activity_categories is a list, not a single value), so
 * these rows don't sum to the candidate total — a donut ring implies a
 * whole being sliced, which would misrepresent that. A bar list makes
 * no such claim; the caption underneath says so explicitly instead of
 * leaving a viewer to assume the percentages add to 100%.
 */
export function ProjectTypeBreakdown({ candidates }: { candidates: CandidateListRow[] }) {
  const total = candidates.length;
  const counts = new Map<ActivityCategory, number>();
  CATEGORIES.forEach((c) => counts.set(c, 0));
  let unclassified = 0;
  let notApplicable = 0;
  candidates.forEach((r) => {
    if (r.activity_not_applicable) {
      notApplicable++;
      return;
    }
    if (r.activity_categories.length === 0) {
      unclassified++;
      return;
    }
    r.activity_categories.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  });

  const rows: { label: string; count: number; to: string; muted?: boolean; title?: string }[] = CATEGORIES.map((c) => ({
    label: c,
    count: counts.get(c) ?? 0,
    to: `/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, activityCategory: c }).toString()}`,
  }));
  if (unclassified > 0) {
    rows.push({
      label: "Unclassified",
      count: unclassified,
      muted: true,
      title: "Real candidates with no activity category resolved yet — a genuine data gap, shown rather than hidden.",
      to: `/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, activityCategory: "unclassified" }).toString()}`,
    });
  }
  if (notApplicable > 0) {
    rows.push({
      label: "Not applicable",
      count: notApplicable,
      muted: true,
      title: "This candidate's real activity genuinely isn't a forestry-carbon project type (see the design system's Unclassified-vs-Not-applicable note).",
      to: `/candidates?${filterParamsToSearchParams({ ...DEFAULT_FILTER_PARAMS, activityCategory: "not_applicable" }).toString()}`,
    });
  }
  rows.sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <Link key={r.label} to={r.to} className="flex items-center gap-2 text-[12.5px] hover:opacity-80" title={r.title}>
            <span className={`w-[126px] shrink-0 truncate ${r.muted ? "italic text-stone-400" : "text-stone-600"}`}>{r.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
              <div className={`h-full rounded-full ${r.muted ? "bg-stone-300" : "bg-teal-600"}`} style={{ width: `${(r.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-stone-500">
              {r.count} ({total ? Math.round((r.count / total) * 100) : 0}%)
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-2.5 text-[12px] text-stone-500">A project can span more than one type, so these don't sum to {total}.</p>
    </div>
  );
}
