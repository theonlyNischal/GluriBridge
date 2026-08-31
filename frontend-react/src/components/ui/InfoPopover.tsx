import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * Level 2 of the progressive-disclosure pattern (2026-08-31) — a real
 * click-to-open popover, not a hover tooltip: this content (source,
 * retrieved timestamp, the fuller "why" reasoning) regularly runs 2-4
 * lines, too much for a hover-only affordance to carry reliably.
 *
 * Level 1 (the fact/hypothesis tag + the claim sentence itself) is
 * NEVER inside this popover — this only ever wraps the SUPPORTING
 * explanation for a claim that's already fully visible beside it.
 *
 * Closes on outside click or Escape; only one instance's content is ever
 * mounted/visible at a time per component (no shared global state needed
 * — each is independent, closing one doesn't affect another).
 */
export function InfoPopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Source & full reasoning"
        aria-label="Source & full reasoning"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${open ? "bg-forest-100 text-forest-700" : "text-stone-400 hover:bg-stone-100 hover:text-forest-700"}`}
      >
        <Info size={13} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-stone-200 bg-white p-3 text-[12px] leading-relaxed text-stone-600 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}
