/**
 * Real-polarity classification for evidence/reason text — additive to the
 * existing fact/hypothesis tagging, never a replacement for it. Grounded
 * in the actual, finite, deterministic set of literal reason strings
 * backend/gluribridge/scoring.py produces (this is a template-based
 * system, not free text — an exact/prefix match against known strings is
 * a reliable classifier here, not a fragile heuristic against
 * open-ended content).
 *
 * Three states, matching the real shape of what these reasons say:
 *   - "positive": a registry-confirmed fact that earned real points —
 *     green.
 *   - "gap": a genuine, checked, confirmed absence (missing DRAM/DPP, no
 *     contact resolved, no BRWA overlap found) — red/flag. Every fired
 *     need_detection_reason (N1-N6) is one of these by construction:
 *     need_score exists specifically to measure documentation/
 *     registration/timing gaps, so there is no "everything's fine" need
 *     reason in scoring.py — only real absence/urgency findings.
 *   - "neutral": the existing honest-disclosure pattern ("Not yet
 *     available...", "Not yet checked...") — genuinely unknown, not a
 *     finding either way. Same gray as HonestState elsewhere, never a
 *     yellow "warning" — these aren't warnings.
 */
export type ReasonPolarity = "positive" | "gap" | "neutral";

const NEUTRAL_PREFIXES = ["Not yet available", "Not yet checked"];

// The exact, complete set of "confirmed absence" credibility_components
// reason strings from scoring.py's score_land_rights/score_geospatial/
// score_contactability — each only appears when a real check ran and
// found nothing, not when the check never happened (those use the
// NEUTRAL_PREFIXES above instead).
const CREDIBILITY_GAP_SUBSTRINGS = [
  "No BRWA overlap found within threshold distance",
  "Only a point location, no full geometry",
  "no named individual contact yet",
  "No contact information available at all",
];

export function classifyCredibilityReason(text: string): ReasonPolarity {
  if (NEUTRAL_PREFIXES.some((p) => text.startsWith(p))) return "neutral";
  if (CREDIBILITY_GAP_SUBSTRINGS.some((p) => text.includes(p))) return "gap";
  return "positive";
}

// need_detection_reasons (N1-N6) and dossier.why_gluri (built directly
// from the same reasons, see dossier.py) are always "gap" — see the
// module docstring above for why there's no exception to carve out here.
export function classifyNeedReason(): ReasonPolarity {
  return "gap";
}

export const POLARITY_STYLE: Record<ReasonPolarity, { border: string; bg: string; text?: string }> = {
  // Deliberately stronger than gap/neutral below — a confirmed positive
  // finding should read as clearly successful at a glance (full-strength
  // background, a thicker border, a bolder green text tone on the reason
  // itself), not just lightly tagged the same weight as everything else.
  positive: { border: "border-l-4 border-l-compliance-green", bg: "bg-compliance-greenBg", text: "text-forest-900" },
  gap: { border: "border-l-2 border-l-compliance-red", bg: "bg-compliance-redBg/40" },
  neutral: { border: "border-l-2 border-l-stone-300", bg: "bg-transparent" },
};
