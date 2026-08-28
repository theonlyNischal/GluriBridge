import type { EvidenceLevel } from "../../lib/types";

/**
 * Fact vs. hypothesis — ONE consistent treatment everywhere a claim is
 * made in the app (need reasons, credibility reasons, dossier why_gluri,
 * news evidence). FACT is a solid teal fill (confident, source-backed);
 * HYPOTHESIS is an outlined amber/clay treatment with a distinct glyph —
 * the shape difference (solid vs. outlined) is deliberate, not just
 * color, so the distinction still reads for a color-blind viewer.
 *
 * Callers whose data may omit evidence_level (credibility_components
 * reasons — see ReasonList) default to "fact" explicitly at the call
 * site, not here: this component always renders one of the two real
 * tags, never a silently-blank third state.
 */
export function EvidenceTag({ level }: { level: EvidenceLevel }) {
  if (level === "fact") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
        <span aria-hidden>●</span>Fact
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-clay-400 bg-clay-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-clay-700">
      <span aria-hidden>◌</span>Hypothesis
    </span>
  );
}
