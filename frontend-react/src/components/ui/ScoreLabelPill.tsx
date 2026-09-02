import type { ScoreLabel } from "../../lib/types";
import { fmtScore } from "../../lib/format";

// Terminology pass (2026-09-02) — plain-language category names, per
// explicit review. "confirmed" -> "Verified Project" here is the
// score_label category (need/credibility axis dominance), a DIFFERENT
// real concept from the Fact/Hypothesis "Confirmed" evidence-level tag
// (EvidenceTag.tsx) — same English word, two distinct real meanings in
// this app, not a naming collision to worry about since they never
// render in the same place. "mixed" -> "Balanced" (proposed and
// confirmed): neither axis dominates is a neutral description, not a
// problem needing attention, so "Needs Review" (rejected) would have
// been actively misleading.
export const SCORE_LABEL_TEXT: Record<ScoreLabel, string> = {
  opportunity: "High Opportunity",
  confirmed: "Verified Project",
  strong_lead: "Promising Lead",
  mixed: "Balanced",
  early_signal: "Early signal",
};

// Colored by WHICH AXIS DOMINATES, never by good/bad — opportunity
// (need-led) gets clay, confirmed (credibility-led) gets forest, anything
// without a single dominant axis (strong_lead/mixed/early_signal) shares
// one neutral stone treatment. Same three-way mapping as every other
// need/credibility element in the app.
export const SCORE_LABEL_STYLE: Record<ScoreLabel, string> = {
  opportunity: "bg-clay-100 text-clay-800",
  confirmed: "bg-forest-100 text-forest-800",
  strong_lead: "bg-stone-200 text-stone-700",
  mixed: "bg-stone-200 text-stone-700",
  early_signal: "bg-stone-200 text-stone-700",
};

/**
 * List/dashboard-row-only in its default form (numbers shown) — ALWAYS
 * paired with both real numbers in the same element there, never a
 * replacement for them, never itself sortable.
 *
 * Deliberately the dominant visual anchor of a candidate row — bigger and
 * bolder than a normal badge — BECAUSE it never ranks need over
 * credibility or vice versa (unlike, say, making the raw need_score
 * number itself the star of the row, which was explicitly rejected: a
 * candidate like Katingan, need=11.1 but credibility=88.2 — this
 * project's single best-evidenced candidate all session — must never
 * visually read as "low priority" just because one of its two axes is
 * small).
 *
 * `showNumbers=false` (used in the candidate-detail-page hero) renders
 * just the labeled pill — the two big, EQUAL-SIZE score cards sitting
 * right beside it already show both real numbers, so repeating
 * "need X / cred X" as small text next to the pill there would be pure
 * redundancy, not an omission of the numbers.
 */
export function ScoreLabelPill({ label, need, cred, showNumbers = true }: { label: ScoreLabel; need: number; cred: number; showNumbers?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span className={`rounded-full px-3 py-1 text-[13px] font-bold ${SCORE_LABEL_STYLE[label]}`}>{SCORE_LABEL_TEXT[label]}</span>
      {showNumbers && (
        <span className="font-mono text-[13px] font-semibold tabular text-stone-600">
          <span title="need score">opp</span> {fmtScore(need)} / <span title="credibility score">evid</span> {fmtScore(cred)}
        </span>
      )}
    </span>
  );
}
