import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * A real, clickable number inline in an executive-summary sentence —
 * shared by the Dashboard and Territory Discovery so every summary number
 * in the app links to the exact filtered Candidates view that produces
 * that same count, never a static claim disconnected from the data.
 */
export function SummaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded font-mono font-semibold text-forest-700 underline decoration-forest-300 decoration-2 underline-offset-2 hover:text-forest-800 hover:decoration-forest-500"
    >
      {children}
    </Link>
  );
}
