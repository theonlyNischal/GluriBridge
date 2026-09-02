import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  cappedReason,
  accent,
  icon: Icon,
  children,
}: {
  axis: "need" | "credibility";
  label: string;
  value: number;
  capped?: boolean;
  // Real explanation for the "capped" badge (2026-08-31) — a bare "capped"
  // word gave a first-time viewer no way to know why or at what value, the
  // same problem this whole round is fixing everywhere else. Optional since
  // only the credibility axis ever caps.
  cappedReason?: string;
  accent: "clay" | "forest";
  // Optional icon (2026-08-31 visual polish) — same badge-circle treatment
  // as the Dashboard's KpiCard icons, reused rather than a new pattern.
  icon?: LucideIcon;
  // Optional (2026-09-02) — the Dashboard's candidate-profile gallery
  // reuses this exact component for a plain "just the number" card, no
  // evidence breakdown underneath. When omitted, the bordered footer
  // section doesn't render at all rather than showing an empty gap.
  children?: ReactNode;
}) {
  const ring = accent === "clay" ? "border-t-clay-500" : "border-t-forest-500";
  const text = accent === "clay" ? "text-clay-700" : "text-forest-700";
  const iconBadge = accent === "clay" ? "bg-clay-50 text-clay-500" : "bg-forest-50 text-forest-500";
  // Instrument-panel shape (2026-08-31 visual-direction rollout): sharp
  // corners, thinner border/accent-stripe (was rounded-xl + border-t-4).
  // Equal height between Need/Credibility is untouched by this — both
  // cards are still the exact same className expression, just with
  // different color tokens, in the same CSS grid row; nothing about the
  // shape change is asymmetric between the two.
  return (
    <div className={`instrument-panel border border-stone-300 border-t-2 bg-white p-4 ${ring}`} data-axis={axis}>
      <div className="flex items-start justify-between gap-2">
        <div className={`font-mono text-figure tabular ${text}`}>
          {fmtScore(value)}
          <span className="ml-1.5 text-base font-medium text-stone-400">/ 100</span>
        </div>
        {Icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBadge}`}>
            <Icon size={18} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {/* Terminology pass (2026-09-02) — title derived from `axis`
            directly (not a new prop threaded through every call site):
            every caller already passes axis, so the real technical term
            ("Need score"/"Credibility score") is always available as a
            hover tooltip regardless of what plain-language `label` text
            a given call site uses. */}
        <h3 title={axis === "need" ? "Need score" : "Credibility score"} className="text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">
          {label}
        </h3>
        {capped && (
          // Terminology pass (2026-09-02): "capped" -> "Evidence-limited".
          // The real technical term ("capped") is kept inside the
          // tooltip text itself (see cappedReason at each call site),
          // not lost.
          <span title={cappedReason} className="inline-flex items-center gap-0.5 rounded bg-compliance-amberBg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-compliance-amber">
            Evidence-limited
            {cappedReason && <Info size={10} aria-hidden />}
          </span>
        )}
      </div>
      {children && <div className="mt-2.5 space-y-2 border-t border-stone-100 pt-2.5">{children}</div>}
    </div>
  );
}
