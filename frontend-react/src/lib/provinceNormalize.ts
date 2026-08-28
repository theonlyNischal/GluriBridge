// The real `province` field is genuinely inconsistent across sources:
// registry-sourced candidates carry the canonical Indonesian ALL-CAPS name
// (e.g. "KALIMANTAN TENGAH"), while news-derived (thin) candidates carry
// free-text English descriptions pulled from articles (e.g. "Central
// Kalimantan", "Central Kalimantan " with trailing whitespace, "West
// Kalimantan province"). Every alias below was confirmed against the
// actual distinct values in the live export (144 candidates) — this is
// not a guessed/invented mapping, it's a real-world Indonesian province
// name normalized to one canonical label so a breakdown-by-province isn't
// misleadingly fragmented (e.g. showing "Central Kalimantan: 8" and
// "Kalimantan Tengah: 3" and "KALIMANTAN TENGAH: 1" as three separate,
// artificially-small rows when they're the same real province).
const PROVINCE_ALIASES: Record<string, string> = {
  "jawa barat": "Jawa Barat",
  "west java": "Jawa Barat",
  "jawa tengah": "Jawa Tengah",
  "central java": "Jawa Tengah",
  "jawa timur": "Jawa Timur",
  "east java": "Jawa Timur",
  "sumatera utara": "Sumatera Utara",
  "north sumatra": "Sumatera Utara",
  "north sumatera": "Sumatera Utara",
  "kalimantan timur": "Kalimantan Timur",
  "east kalimantan": "Kalimantan Timur",
  "east kalimantan province": "Kalimantan Timur",
  "kalimantan tengah": "Kalimantan Tengah",
  "central kalimantan": "Kalimantan Tengah",
  "kalimantan barat": "Kalimantan Barat",
  "west kalimantan": "Kalimantan Barat",
  "west kalimantan province": "Kalimantan Barat",
  "kalimantan utara": "Kalimantan Utara",
  "north kalimantan": "Kalimantan Utara",
  riau: "Riau",
  "riau province": "Riau",
  maluku: "Maluku",
  "maluku province": "Maluku",
  "sulawesi tengah": "Sulawesi Tengah",
  "central sulawesi": "Sulawesi Tengah",
  "sulawesi utara": "Sulawesi Utara",
  "north sulawesi": "Sulawesi Utara",
  aceh: "Aceh",
  banten: "Banten",
  "nusa tenggara timur": "Nusa Tenggara Timur",
  "east nusa tenggara": "Nusa Tenggara Timur",
  "papua barat": "Papua Barat",
  "west papua": "Papua Barat",
  "p a p u a": "Papua",
  "south sulawesi": "Sulawesi Selatan",
  "south sumatra": "Sumatera Selatan",
  "south sumatera": "Sumatera Selatan",
  "south sumatra province": "Sumatera Selatan",
  "south sumatera province": "Sumatera Selatan",
  gorontalo: "Gorontalo",
  "gorontalo province": "Gorontalo",
};

// Genuinely ambiguous — the real source text names two provinces at once,
// so no single real province can be attributed without guessing which one.
const MULTI_REGION = new Set(["aceh and north sumatra", "aceh and north sumatra provinces"]);

export const PROVINCE_NOT_AVAILABLE = "Not available";
export const PROVINCE_MULTI_REGION = "Spans multiple provinces";

export function normalizeProvince(raw: string | null): string {
  if (!raw) return PROVINCE_NOT_AVAILABLE;
  const key = raw.trim().toLowerCase();
  if (MULTI_REGION.has(key)) return PROVINCE_MULTI_REGION;
  if (PROVINCE_ALIASES[key]) return PROVINCE_ALIASES[key];
  // A real sub-district string that still unambiguously names one real
  // province (e.g. "Siak District, Riau Province") — matched by substring
  // only as a last resort, never for the ambiguous multi-region cases above.
  if (key.includes("riau")) return "Riau";
  // Unrecognized but real — shown as-is (trimmed) rather than silently
  // dropped or forced into the wrong bucket.
  return raw.trim();
}

/**
 * THE single real province-grouping implementation — used by the
 * Dashboard's province panel and Territory Discovery's per-region stats
 * and "top territories" ranking alike, so "which real candidates are in
 * Kalimantan Tengah" can never quietly diverge between the two pages.
 */
export function groupByProvince<T extends { province: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const p = normalizeProvince(r.province);
    const bucket = map.get(p);
    if (bucket) bucket.push(r);
    else map.set(p, [r]);
  }
  return map;
}
