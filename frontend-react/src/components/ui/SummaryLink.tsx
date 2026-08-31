import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * A real, clickable number inline in an executive-summary sentence —
 * shared by the Dashboard and Territory Discovery so every summary number
 * in the app links to the exact filtered Candidates view that produces
 * that same count, never a static claim disconnected from the data.
 */
export function SummaryLink({ to, children, muted = false }: { to: string; children: ReactNode; muted?: boolean }) {
  // muted (2026-08-31, Dashboard visual-direction test) — dials the
  // forest-green accent back to ink/stone, part of reserving color for
  // only the one most important element per screen. Opt-in, default
  // unchanged, so Territory Discovery's own usage is unaffected.
  const colorClasses = muted
    ? "text-stone-700 decoration-stone-400 hover:text-stone-900 hover:decoration-stone-600"
    : "text-forest-700 decoration-forest-300 hover:text-forest-800 hover:decoration-forest-500";
  return (
    <Link to={to} className={`rounded font-mono font-semibold underline decoration-2 underline-offset-2 ${colorClasses}`}>
      {children}
    </Link>
  );
}
