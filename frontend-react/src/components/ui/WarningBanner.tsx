import { AlertTriangle } from "lucide-react";

/**
 * The shared treatment for an actionable warning (2026-08-31) — a real
 * blocker the user needs to act on (e.g. "this outreach draft can't
 * actually be sent yet"), NOT an absence-state. Deliberately a separate
 * component from HonestState: HonestState is explicitly NOT styled like
 * an alarm ("a normal, expected state... not a failure" — see its own
 * docstring), which is the wrong register here — this warning genuinely
 * should read as amber/alert, using the same AlertTriangle icon language
 * already used by ContactReadinessIndicator and KeyGapsSidebar for the
 * same real "needs attention" states.
 *
 * Previously rendered as one run-on sentence ("⚠ {message}") — this
 * splits the backend's real message on its own natural " — " clause
 * break (already present in every real outreach.py warning string) into
 * a short bold headline + a muted supporting line. Presentation only:
 * the exact same real text, restructured, never reworded or shortened.
 * Falls back to rendering the whole message as the headline if no " — "
 * is present, so an unexpected string still renders sensibly rather than
 * breaking.
 */
export function WarningBanner({ message }: { message: string }) {
  const sepIdx = message.indexOf(" — ");
  const headline = sepIdx === -1 ? message : message.slice(0, sepIdx);
  const detail = sepIdx === -1 ? null : message.slice(sepIdx + 3);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-compliance-amber/30 bg-compliance-amberBg px-3 py-2.5">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-compliance-amber" />
      <div>
        <p className="text-[13px] font-semibold text-compliance-amber">{headline}</p>
        {detail && <p className="mt-0.5 text-[12px] leading-relaxed text-stone-600">{detail}</p>}
      </div>
    </div>
  );
}
