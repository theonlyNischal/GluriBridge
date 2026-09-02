import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "../../lib/useCountUp";

/**
 * Dashboard-metric-card treatment — large bold number, small muted label,
 * tight padding, no heavy border. Shared between the Dashboard and the
 * Candidates list toolbar (same real component, not a duplicate) so the
 * "what does a metric card look like in this app" answer is one place.
 *
 * `to` makes the whole card a real link into a filtered Candidates view
 * (e.g. "High need (≥70)" → /candidates?minNeed=70) — the count shown and
 * the rows you land on are guaranteed to match, since both come from the
 * same real field/threshold. Omit `to` for a plain, non-interactive card.
 */
export function KpiCard({
  label,
  value,
  sub,
  accent,
  to,
  size = "sm",
  icon: Icon,
  animateValue = false,
  variant = "default",
  live = false,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: "clay" | "forest" | "amber";
  to?: string;
  // "lg" — Dashboard's hero treatment (2026-08-31): bigger number, more
  // internal breathing room, the metric cards ARE the main visual focus
  // rather than a compact toolbar strip. Defaults to "sm" so the existing
  // Candidates-list toolbar usage (a real, different shared use of this
  // same component, not a duplicate) is completely unaffected.
  size?: "sm" | "lg";
  // Optional icon (2026-08-31 visual polish) — only ever passed by the
  // Dashboard's "lg" cards; the Candidates-list toolbar's "sm" usage
  // never passes one, so it's visually untouched.
  icon?: LucideIcon;
  // Count-up-on-mount motion (2026-08-31) — opt-in, scoped to the
  // Dashboard's "lg" cards only (per the explicit ask); the Candidates-
  // list toolbar and Tracked page's "sm" usage never pass this, so
  // they're visually and behaviorally unaffected.
  animateValue?: boolean;
  // "instrument" (2026-08-31, Dashboard visual-direction test) — sharp
  // corners, hairline border, no shadow, a readout-style rule under the
  // number. Opt-in, default unchanged.
  variant?: "default" | "instrument";
  // Small pulsing dot next to the label (2026-08-31 test) — signals this
  // specific number is read from the live API right now. Opt-in, meant
  // for exactly one card per screen, not every card at once.
  live?: boolean;
}) {
  // "lg" (the Dashboard hero) uses a step lighter than the "sm" toolbar's
  // 700 shade, but NOT the original 500 this used before 2026-09-02: a
  // real contrast check found clay-500/forest-500 measured only 5.26:1/
  // 6.14:1 against the white card background — clearly weaker than the
  // plain stone-900 number on every other hero card (16.68:1), the exact
  // opposite of "the loudest thing on the screen." 600 keeps the same
  // "not near-black" intent that motivated moving off 700 in the first
  // place, while clearing WCAG AAA (7.37:1/8.16:1) — still visibly a step
  // lighter than the "sm" toolbar's own 700, so that distinction survives.
  // The "sm" toolbar usage keeps the original 700 shades unchanged — not
  // the same visual problem at that size, and not something this round
  // was asked to touch.
  const valueColor =
    accent === "clay" ? (size === "lg" ? "text-clay-600" : "text-clay-700")
    : accent === "forest" ? (size === "lg" ? "text-forest-600" : "text-forest-700")
    : accent === "amber" ? "text-compliance-amber"
    : "text-stone-900";
  const iconBadge =
    accent === "clay" ? "bg-clay-50 text-clay-500"
    : accent === "forest" ? "bg-forest-50 text-forest-500"
    : accent === "amber" ? "bg-compliance-amberBg text-compliance-amber"
    : "bg-stone-100 text-stone-500";
  const padding = size === "lg" ? "px-5 py-5" : "px-4 py-3";
  // Hook always called (React rules), result only used when opted in —
  // cheap (a single rAF loop), never runs for the "sm" toolbar usages.
  const animated = useCountUp(value);
  const displayValue = animateValue ? animated : value;
  const shape = variant === "instrument" ? "instrument-panel border-stone-300" : "rounded-lg border-stone-200";
  const className = `block border bg-white ${shape} ${padding} ${to ? "cursor-pointer transition-colors hover:border-forest-300 hover:bg-forest-50/40 hover-lift" : ""}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          {live && (
            <span className="relative flex h-1.5 w-1.5" title="Live — reading from the API right now">
              <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-forest-500" />
            </span>
          )}
          {label}
        </div>
        {Icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBadge}`}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
      </div>
      {/* Instrument variant (2026-08-31 test): a thin readout-style rule
          directly under the number and slightly wider digit tracking —
          pushes the existing monospace treatment further toward "a real
          telemetry display," not just a bigger bold figure. */}
      <div
        className={`mt-1.5 inline-block font-mono ${size === "lg" ? "text-figure font-bold" : "text-figure-sm"} tabular ${valueColor} ${
          variant === "instrument" ? "tracking-wide border-b border-current/25 pb-1" : ""
        }`}
      >
        {displayValue}
      </div>
      {sub && <div className="mt-1 text-[11.5px] text-stone-400">{sub}</div>}
    </>
  );
  if (to)
    return (
      <Link to={to} className={className} title={`View the ${value} candidates behind this number`}>
        {content}
      </Link>
    );
  return <div className={className}>{content}</div>;
}
