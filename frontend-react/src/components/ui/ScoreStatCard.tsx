import type { ReactNode } from "react";
import { fmtScore } from "../../lib/format";

/**
 * The candidate-detail-page score treatment — need and credibility
 * ALWAYS rendered as two side-by-side panels of EXACTLY equal size and
 * visual weight relative to EACH OTHER (same classes, same structure,
 * only the accent color and value differ), never as one blended figure
 * and never with a score_label pill (that's WhyContactFirst's job, above
 * these cards).
 *
 * Deliberately demoted as a PAIR (2026-08-30 restructure): this used to
 * be the page's loudest visual element (text-figure-xl, a 6px accent
 * border) sitting ABOVE a quiet one-line recommendation, so the raw
 * numbers read as "the point" before anyone read into WHY a candidate
 * mattered. Now WhyContactFirst is the hero and this pair is real,
 * still-equal-to-each-other supporting evidence underneath it —
 * text-figure instead of text-figure-xl, a thinner 4px border, tighter
 * padding. Equal weight to EACH OTHER is unchanged and still enforced by
 * this being one shared component instantiated twice with identical
 * classes; only the pair's weight relative to the rest of the page
 * dropped.
 */
export function ScoreStatCard({
  axis,
  label,
  value,
  capped,
  accent,
  children,
}: {
  axis: "need" | "credibility";
  label: string;
  value: number;
  capped?: boolean;
  accent: "clay" | "forest";
  children: ReactNode;
}) {
  const ring = accent === "clay" ? "border-t-clay-500" : "border-t-forest-500";
  const text = accent === "clay" ? "text-clay-700" : "text-forest-700";
  return (
    <div className={`rounded-xl border border-stone-200 border-t-4 bg-white p-4 ${ring}`} data-axis={axis}>
      <div className={`font-mono text-figure tabular ${text}`}>
        {fmtScore(value)}
        <span className="ml-1.5 text-base font-medium text-stone-400">/ 100</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">{label}</h3>
        {capped && (
          <span className="rounded bg-compliance-amberBg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-compliance-amber">capped</span>
        )}
      </div>
      <div className="mt-2.5 space-y-2 border-t border-stone-100 pt-2.5">{children}</div>
    </div>
  );
}
