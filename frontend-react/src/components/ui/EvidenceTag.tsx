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
 *
 * Terminology pass (2026-09-02) — "Fact"/"Hypothesis" -> "Confirmed"/
 * "Inferred", with one deliberate correction to the initially-proposed
 * mapping: "Confirmed," not "Verified." "Verified" implies someone
 * independently checked the claim; this tag means the claim was read
 * directly from an official registry field — a real, load-bearing
 * distinction for what this app is actually claiming, not a synonym
 * swap. The real underlying kind (fact/hypothesis) is kept as a title
 * tooltip on each tag.
 */
export function EvidenceTag({ level }: { level: EvidenceLevel }) {
  if (level === "fact") {
    return (
      <span title="Fact" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">
        <span aria-hidden>●</span>Confirmed
      </span>
    );
  }
  return (
    <span title="Hypothesis" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-clay-400 bg-clay-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-clay-700">
      <span aria-hidden>◌</span>Inferred
    </span>
  );
}
