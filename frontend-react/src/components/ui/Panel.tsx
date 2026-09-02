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
      {/* 2026-09-02: bumped from text-[15px]/font-semibold/stone-800 —
          stone-800 on white already measured 13.33:1 (near WCAG max), so
          the real lever here is weight/size, not color. stone-900/bold/
          16px, no new color, meant to read as the loudest text on the
          panel next to its own body copy. */}
      {title && <h3 className="mb-3 font-display text-[16px] font-bold text-stone-900">{title}</h3>}
      {children}
    </section>
  );
}
