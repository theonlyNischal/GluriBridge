import { useEffect, useRef, useState } from "react";

/**
 * Animates a number counting up from 0 to `value` on mount/change —
 * KPI cards only (2026-08-31 motion pass), never a data transform: the
 * real value is always what's eventually shown and what's used anywhere
 * else (a link's href, a title attribute) — this only affects what's
 * painted on screen mid-animation. Pure requestAnimationFrame, no
 * dependency. Ease-out cubic, restrained (~500ms default, snappy not
 * slow, per the explicit 400-600ms ask).
 *
 * Re-triggers whenever `value` itself changes (e.g. a fresh KPI load
 * after a filter change) — always animates FROM 0, matching "on load,"
 * not a real transition between two prior counts.
 */
export function useCountUp(value: number, durationMs = 500): number {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Respect prefers-reduced-motion — jump straight to the real value.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return display;
}
