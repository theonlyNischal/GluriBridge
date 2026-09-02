import type { CandidateStatusValue } from "../../lib/types";

// THE single source of truth for the status vocabulary — the detail
// page's selector, the Candidates list filter, the Candidates table
// column, and the Dashboard's outreach breakdown all import this same
// map/order, so the 5 values and their labels can never drift apart
// between those four surfaces.
export const STATUS_LABEL: Record<CandidateStatusValue, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  follow_up_needed: "Follow-up needed",
  done: "Done",
  rejected: "Rejected",
};

// Same "no unwarranted red" discipline as ComplianceBadge/HonestState:
// not_contacted and follow_up_needed are ordinary, expected states, not
// failures — only forest (done) reads as unambiguously positive/closed.
// rejected gets a muted, closed-out treatment (not alarm-red) since
// declining to proceed is a normal business outcome, not an error.
export const STATUS_STYLE: Record<CandidateStatusValue, string> = {
  not_contacted: "bg-stone-100 text-stone-600",
  contacted: "bg-teal-100 text-teal-800",
  follow_up_needed: "bg-clay-100 text-clay-800",
  done: "bg-forest-100 text-forest-800",
  rejected: "bg-stone-200 text-stone-500",
};

// Hex equivalents of STATUS_STYLE's Tailwind classes (2026-09-02) — SVG
// fill/stroke can't consume Tailwind utility classes directly, so this
// stays hand-kept in sync the same way ScatterPlot.tsx's DOT_COLOR is;
// used by the Dashboard's Outreach status donut.
export const STATUS_DOT_COLOR: Record<CandidateStatusValue, string> = {
  not_contacted: "#a89577", // stone-400
  contacted: "#245452", // teal-600
  follow_up_needed: "#a05a2c", // clay-500
  done: "#2f6d4f", // forest-500
  rejected: "#c9bba1", // stone-300
};

export const STATUS_OPTIONS: { value: CandidateStatusValue; label: string }[] = (
  Object.keys(STATUS_LABEL) as CandidateStatusValue[]
).map((value) => ({ value, label: STATUS_LABEL[value] }));

export function StatusBadge({ status }: { status: CandidateStatusValue }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
