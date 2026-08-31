import type { ReactNode } from "react";

export function Panel({
  title,
  children,
  className = "",
  id,
  variant = "default",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  id?: string;
  // "instrument" (2026-08-31, Dashboard visual-direction test) — sharp
  // corners, thin hairline border, no shadow, per the .instrument-panel
  // utility. Opt-in, default unchanged, so every existing page/usage of
  // Panel is completely unaffected until explicitly opted in.
  variant?: "default" | "instrument";
}) {
  const shape = variant === "instrument" ? "instrument-panel border-stone-300" : "rounded-xl border-stone-200";
  return (
    // min-w-0 matters whenever this is a direct grid/flex item (which it
    // usually is) — without it, a grid/flex item won't shrink below its
    // content's intrinsic width by default, so a long truncated name
    // deep inside can silently force the WHOLE track wider than its
    // fr-share and overflow the page. Harmless when Panel isn't a
    // grid/flex child (min-width only matters in those contexts).
    // `id` is optional and purely a scroll-anchor target (e.g. the
    // Candidate Detail page's wayfinding rail) — never required, never
    // rendered as visible content.
    <section id={id} className={`min-w-0 border bg-white p-5 ${shape} ${className}`}>
      {title && <h3 className="mb-3 font-display text-[15px] font-semibold text-stone-800">{title}</h3>}
      {children}
    </section>
  );
}
