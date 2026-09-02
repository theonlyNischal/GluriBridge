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

/**
 * Terminology pass (2026-09-02) — land_rights_category's real values
 * (backend/gluribridge/schema.py: 'PBPH' | 'perhutanan_sosial' |
 * 'hutan_adat' | 'hutan_hak' | 'PB_PJL_karbon') were rendered raw
 * (candidate.land_rights_category.replace(/_/g, " ") + CSS capitalize)
 * — untranslated Indonesian/acronym fragments with zero explanation
 * anywhere in the UI. Only 'hutan_adat' is present in the live 144-
 * candidate dataset today, but all 5 are real schema values a future
 * refresh could surface, so all 5 are mapped, not just today's one.
 * The real technical term is kept as a `title` tooltip at the one call
 * site that renders this (CandidateDetailPage's Land Rights panel).
 */
export const LAND_RIGHTS_CATEGORY_LABEL: Record<string, string> = {
  PBPH: "Forestry Business Permit",
  perhutanan_sosial: "Social Forestry",
  hutan_adat: "Customary Forest",
  hutan_hak: "Privately Titled Forest",
  PB_PJL_karbon: "Carbon Services Permit",
};

/**
 * Terminology pass (2026-09-02) — verification_status's real values
 * (backend/gluribridge/schema.py / normalize_sruk.py / normalize_verra.py
 * / news_matching.py: 'registry_confirmed' | 'unverified') were rendered
 * raw the same way as land_rights_category above. Only 'registry_confirmed'
 * was in this round's explicit ask; 'unverified' falls back to the same
 * raw-replace rendering it always had, unchanged.
 */
export const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  registry_confirmed: "Officially Verified",
};

/**
 * Terminology pass (2026-09-02) — data_richness's real values
 * ('rich' | 'corroborated' | 'thin') were rendered as the raw enum value
 * with CSS capitalize (RichnessBadge). 'corroborated' wasn't part of
 * this round's explicit ask, so it keeps its plain capitalized form.
 */
export const RICHNESS_DISPLAY_LABEL: Record<string, string> = {
  rich: "Strong Evidence",
  thin: "Limited Evidence",
};
