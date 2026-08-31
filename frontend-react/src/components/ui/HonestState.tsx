import type { ReactNode } from "react";

/**
 * THE honest-disclosure pattern — one visual treatment for every "we're
 * telling you what we don't know, or what we don't trust" state in the
 * app: not yet checked, no data on file, not_applicable compliance,
 * coordinate flagged as implausible, no source document, insufficient
 * contact, etc. Previously each of these was ad hoc text scattered per
 * panel; here they're all the same component with a `kind`-specific
 * label, so a user learns the pattern once ("dashed border + muted
 * glyph = absence-state, not real data") and recognizes it everywhere.
 *
 * Deliberately NOT styled like an error (no red, no alarm) — an honest
 * "don't know" is a normal, expected state in this pipeline, not a
 * failure. Deliberately NOT styled like real data either (dashed border,
 * muted stone tone, distinct from every real-data card's solid border).
 */
const KIND_LABEL: Record<string, string> = {
  not_checked: "Not yet checked",
  no_data: "No data on file",
  not_applicable: "Not applicable",
  not_trusted: "On file, not trusted",
  no_source: "No single source document",
  insufficient: "Insufficient data",
};

export function HonestState({
  kind,
  label,
  children,
  compact = false,
  title,
}: {
  kind: keyof typeof KIND_LABEL;
  label?: string;
  children?: ReactNode;
  compact?: boolean;
  // Native title attribute (hover tooltip) — for a compact instance whose
  // real explanation is too long to inline without ballooning a table
  // row's height (2026-08-31: activity-type badges in a 200px table
  // column). Applies to both branches; a caller can pass this INSTEAD of
  // children in the compact case and still keep the full reason
  // reachable on hover, not silently dropped.
  title?: string;
}) {
  if (compact) {
    return (
      <span title={title} className="inline-flex items-center gap-1.5 rounded border border-dashed border-stone-300 bg-stone-100 px-2 py-0.5 text-[12px] italic text-stone-500">
        <span aria-hidden className="not-italic">
          —
        </span>
        {label ?? KIND_LABEL[kind]}
        {children && <span className="not-italic">: {children}</span>}
      </span>
    );
  }
  return (
    <div title={title} className="rounded-lg border border-dashed border-stone-300 bg-stone-100/70 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        <span aria-hidden>—</span>
        {label ?? KIND_LABEL[kind]}
      </div>
      {children && <div className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{children}</div>}
    </div>
  );
}
