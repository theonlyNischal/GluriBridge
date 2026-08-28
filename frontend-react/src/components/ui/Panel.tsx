import type { ReactNode } from "react";

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    // min-w-0 matters whenever this is a direct grid/flex item (which it
    // usually is) — without it, a grid/flex item won't shrink below its
    // content's intrinsic width by default, so a long truncated name
    // deep inside can silently force the WHOLE track wider than its
    // fr-share and overflow the page. Harmless when Panel isn't a
    // grid/flex child (min-width only matters in those contexts).
    <section className={`min-w-0 rounded-xl border border-stone-200 bg-white p-5 ${className}`}>
      {title && <h3 className="mb-3 font-display text-[15px] font-semibold text-stone-800">{title}</h3>}
      {children}
    </section>
  );
}
