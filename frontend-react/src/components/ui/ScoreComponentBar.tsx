import type { ScoreComponent } from "../../lib/types";
import { ReasonList } from "./ReasonList";

/** One credibility sub-component (registry status / land rights / geospatial / contactability) — same treatment used 4x per candidate. */
export function ScoreComponentBar({ label, component }: { label: string; component: ScoreComponent }) {
  const pct = component.max ? Math.round((component.points / component.max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-stone-700">{label}</span>
        <span className="font-mono text-[12px] tabular text-stone-500">
          {component.points} / {component.max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-forest-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2">
        <ReasonList reasons={component.reasons} kind="credibility" />
      </div>
    </div>
  );
}
