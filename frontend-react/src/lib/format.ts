/** One place every real score/percentage figure in the app formats through — same rounding everywhere. */
export function fmtScore(n: number): string {
  return n.toFixed(1);
}

/**
 * BRWA's real policy_tier values ('penetapan' / 'pengaturan' / 'belum_ada')
 * are Indonesian legal-status terms with no gloss anywhere in the raw data —
 * translated here once so every panel that shows a territory's policy tier
 * (Land Rights panel, Territory Discovery search) reads in plain English
 * instead of leaking the untranslated enum.
 */
export const POLICY_TIER_LABEL: Record<string, string> = {
  penetapan: "Formally decreed",
  pengaturan: "In regulatory process",
  belum_ada: "Not yet established",
};

/** Identity-resolution match_status real values -> plain English. */
export const MATCH_STATUS_LABEL: Record<string, string> = {
  primary: "Primary record",
  auto_merged: "Automatically merged",
};
