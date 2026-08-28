import type { ReactNode } from "react";
import { fmtScore } from "../../lib/format";

/**
 * The candidate-detail-page "full" score treatment — need and credibility
 * ALWAYS rendered as two side-by-side panels of EXACTLY equal size and
 * visual weight (same classes, same structure, only the accent color and
 * value differ), never as one blended figure and never with a
 * score_label pill (that's the hero's job, above these cards). This is
 * the one place in the whole app where the raw number is the hero
 * element — Stripe/Linear-style KPI treatment: the number leads, large
 * and bold, with the axis name as a small label underneath it, not the
 * other way around.
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
    <div className={`rounded-xl border border-stone-200 border-t-[6px] bg-white p-6 ${ring}`} data-axis={axis}>
      <div className={`font-mono text-figure-xl tabular ${text}`}>
        {fmtScore(value)}
        <span className="ml-1.5 text-lg font-medium text-stone-400">/ 100</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">{label}</h3>
        {capped && (
          <span className="rounded bg-compliance-amberBg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-compliance-amber">capped</span>
        )}
      </div>
      <div className="mt-4 space-y-2 border-t border-stone-100 pt-4">{children}</div>
    </div>
  );
}
