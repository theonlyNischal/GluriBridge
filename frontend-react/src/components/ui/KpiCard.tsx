import { Link } from "react-router-dom";

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
}) {
  const valueColor = accent === "clay" ? "text-clay-700" : accent === "forest" ? "text-forest-700" : accent === "amber" ? "text-compliance-amber" : "text-stone-900";
  const padding = size === "lg" ? "px-5 py-5" : "px-4 py-3";
  const className = `block rounded-lg border border-stone-200 bg-white ${padding} ${to ? "cursor-pointer transition-colors hover:border-forest-300 hover:bg-forest-50/40" : ""}`;
  const content = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1.5 font-mono ${size === "lg" ? "text-figure" : "text-figure-sm"} tabular ${valueColor}`}>{value}</div>
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
