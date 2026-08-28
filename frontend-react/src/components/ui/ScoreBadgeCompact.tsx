import { fmtScore } from "../../lib/format";

/**
 * The two-axis pairing used wherever space is tight (page header, list
 * rows) — need_score and credibility_score are ALWAYS two adjacent
 * figures, never averaged or blended into one number. Clay = need axis,
 * forest = credibility axis, matching the same two colors used
 * everywhere else in the app (ScoreStatCard, ScoreLabelPill) so a viewer
 * learns the color mapping once.
 */
export function ScoreBadgeCompact({ need, cred }: { need: number; cred: number }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-stone-200 font-mono text-[12px] font-semibold tabular">
      <span className="bg-clay-50 px-2 py-1 text-clay-700">
        <span className="mr-1 text-[9px] font-bold uppercase text-clay-400">N</span>
        {fmtScore(need)}
      </span>
      <span className="bg-forest-50 px-2 py-1 text-forest-700">
        <span className="mr-1 text-[9px] font-bold uppercase text-forest-400">C</span>
        {fmtScore(cred)}
      </span>
    </span>
  );
}
