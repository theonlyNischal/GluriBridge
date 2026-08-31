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
  // "lg" (the Dashboard hero) uses a lighter step on the same clay/forest
  // scale (500, not 700) — 700 reads as near-black at this size (real
  // user feedback, 2026-08-31: "only the compliance card has strong
  // color"), because clay-700/forest-700 are muted DARK shades by design
  // for regular body/label text elsewhere in the app, not built to carry
  // a big standalone number. clay-500/forest-500 match compliance-amber/
  // compliance-green's own lightness (confirmed: forest-500 IS the exact
  // hex compliance.green uses), giving all 3 colored hero numbers the
  // same visual weight. The "sm" toolbar usage keeps the original 700
  // shades unchanged — not the same visual problem at that size, and not
  // something this round was asked to touch.
  const valueColor =
    accent === "clay" ? (size === "lg" ? "text-clay-500" : "text-clay-700")
    : accent === "forest" ? (size === "lg" ? "text-forest-500" : "text-forest-700")
    : accent === "amber" ? "text-compliance-amber"
    : "text-stone-900";
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
