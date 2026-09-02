const R = 40;
const CX = 50;
const CY = 50;
const STROKE = 14;
const CIRC = 2 * Math.PI * R;

/**
 * Small multi-segment donut ring — pure SVG (stroke-dasharray per
 * segment around a circle), no chart library. Real values only: each
 * segment's arc length is exactly its share of the real total passed
 * in, nothing normalized or invented. Used on the Dashboard for Data
 * richness / Outreach status (2026-09-02 visual pass) as a more
 * compact, scannable alternative to a stack of bar rows for a small
 * fixed set of categories that sum to a real whole.
 */
export function DonutChart({ segments, size = 100 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f0ebe2" strokeWidth={STROKE} />
      {segments.map((seg, i) => {
        if (seg.value <= 0) return null;
        const dash = (seg.value / total) * CIRC;
        const circle = (
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={`${dash} ${CIRC - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return circle;
      })}
    </svg>
  );
}
