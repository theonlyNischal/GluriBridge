import type { ActivityTypeResult } from "../../lib/types";
import { HonestState } from "./HonestState";

/**
 * Real activity-type classification, rendered — see
 * backend/gluribridge/activity_type.py's module docstring for the real
 * 2026-08-31 classification test this is built from.
 *
 * Three real, mutually exclusive states, never blended:
 *   1. One or more real category tags (multi-tag — a candidate can
 *      genuinely be Peatland + Reforestation + Conservation at once).
 *   2. "Unclassified" — a real candidate whose title/data this
 *      classifier's current keyword/field coverage doesn't reach. A
 *      real, nameable coverage gap, not a claim that no category applies.
 *   3. "Not applicable" — this candidate's real activity genuinely isn't
 *      a forestry land-use type at all (confirmed via Verra's own
 *      afolu_activities field, never guessed from title text).
 * Same HonestState treatment used everywhere else in this app for a
 * "we're telling you what we don't know/what doesn't apply" state — but
 * Unclassified and Not applicable are deliberately two DISTINCT labels/
 * reasons, not one generic "Other" bucket.
 */
const UNCLASSIFIED_REASON = "A real candidate — this classifier's current keyword/field coverage doesn't match its title.";

export function ActivityTypeBadges({
  activityType,
  compact = false,
  maxVisible,
}: {
  activityType: ActivityTypeResult;
  compact?: boolean;
  // Caps how many real category pills render before the rest collapse
  // into a "+N" pill (2026-08-31, the Candidates list's card grid) —
  // real classification data is never silently dropped, just deferred to
  // hover: the "+N" pill's title lists every hidden category by name.
  // Omitted (default) renders every category, unchanged for every
  // existing caller (the table, the Candidate Detail page).
  maxVisible?: number;
}) {
  if (activityType.not_applicable) {
    // Compact (table-cell) instance: the real reason is too long to
    // inline without ballooning the row's height — kept reachable via
    // hover instead of dropped. Non-compact (Candidate Detail): shown in
    // full, inline, same as every other HonestState on that page.
    return compact ? (
      <HonestState kind="not_applicable" label="Not applicable" compact title={activityType.not_applicable_reason ?? undefined} />
    ) : (
      <HonestState kind="not_applicable" label="Not applicable">{activityType.not_applicable_reason}</HonestState>
    );
  }
  if (activityType.categories.length === 0) {
    return compact ? (
      <HonestState kind="no_data" label="Unclassified" compact title={UNCLASSIFIED_REASON} />
    ) : (
      <HonestState kind="no_data" label="Unclassified">{UNCLASSIFIED_REASON}</HonestState>
    );
  }
  const visible = maxVisible ? activityType.categories.slice(0, maxVisible) : activityType.categories;
  const hidden = maxVisible ? activityType.categories.slice(maxVisible) : [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((cat) => (
        <span key={cat} className="inline-block whitespace-nowrap rounded bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
          {cat}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          title={hidden.join(", ")}
          className="inline-block cursor-help whitespace-nowrap rounded bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600"
        >
          +{hidden.length}
        </span>
      )}
    </div>
  );
}
