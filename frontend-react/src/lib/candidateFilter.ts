import { normalizeProvince } from "./provinceNormalize";
import type { CandidateListRow, CandidateStatusValue } from "./types";

export type SortKey = "need_score" | "credibility_score";
export type SortDir = "asc" | "desc";

export interface CandidateFilterParams {
  search: string;
  richness: string; // "" | "rich" | "corroborated" | "thin"
  // "" | one of the 5 real outreach-status values (see StatusBadge.ts) —
  // replaces the original binary contacted yes/no (2026-08-28).
  status: CandidateStatusValue | "";
  // Threshold/flag filters driven from the Dashboard's clickable summary
  // numbers (e.g. "High need (≥70)" → minNeed=70) — reuse the same real
  // fields the Dashboard already counts with, never a new invented
  // category. null/"" means "no filter", same convention as the params
  // above.
  minNeed: number | null;
  minCred: number | null;
  complianceFlag: string; // "" | "approaching" (compliance_badge amber OR red — same definition Dashboard's KPI card counts)
  contactResolved: string; // "" | "yes" | "no" (has_resolved_contact)
  // "" | "yes" | "no" (has_email) — deliberately separate from
  // contactResolved (2026-08-31 audit): a resolved contact can be a Tier
  // A registrant NAME with no email at all (83 of 144 real candidates),
  // which is not "ready for outreach." This is the one param that means
  // an actual email address is on file.
  hasEmail: string;
  // "" | "yes" | "no" (has_low_confidence_email) — a real email that's
  // genuinely on file but NOT "high" confidence (2026-08-31 follow-up:
  // a manual spot-check found one real Tier B match too generic/weak to
  // count alongside the confident ones in hasEmail, but not a false
  // positive either, so it's its own distinct bucket, not silently
  // dropped).
  lowConfidenceEmail: string;
  // "" | a normalizeProvince() output label (e.g. "Kalimantan Tengah",
  // "Not available") — Territory Discovery's left filter panel and its
  // province-region selection both drive this same param, never a
  // separate province-grouping concept.
  province: string;
  brwaOverlap: string; // "" | "yes" | "no" (has_brwa_evidence)
  sortKey: SortKey | null;
  sortDir: SortDir;
}

export const DEFAULT_FILTER_PARAMS: CandidateFilterParams = {
  search: "",
  richness: "",
  status: "",
  minNeed: null,
  minCred: null,
  complianceFlag: "",
  contactResolved: "",
  hasEmail: "",
  lowConfidenceEmail: "",
  province: "",
  brwaOverlap: "",
  sortKey: null,
  sortDir: "desc",
};

/**
 * THE single real filter+sort implementation — used by both the
 * Candidates list (to render its table) and the candidate detail page
 * (to compute prev/next through the exact same curated set). Before this
 * existed, the list's filter/sort was local component state with no
 * plumbing anywhere else — a candidate detail page had no way to know
 * "which subset, in what order" the user had actually been looking at.
 * One function, reused, means the two pages can never silently diverge
 * on what "the current view" means.
 */
export function applyCandidateFilter(candidates: CandidateListRow[], params: CandidateFilterParams): CandidateListRow[] {
  let out = candidates;
  if (params.search) {
    const s = params.search.toLowerCase();
    out = out.filter((r) => r.name.toLowerCase().includes(s) || (r.org ?? "").toLowerCase().includes(s));
  }
  if (params.richness) out = out.filter((r) => r.data_richness === params.richness);
  if (params.status) out = out.filter((r) => r.status === params.status);
  if (params.minNeed != null) out = out.filter((r) => r.need_score >= params.minNeed!);
  if (params.minCred != null) out = out.filter((r) => r.credibility_score >= params.minCred!);
  // "approaching" == compliance_badge is amber or red — the exact same
  // definition the Dashboard's "Compliance deadline approaching" KPI
  // counts with, so the linked-through view always matches the number
  // that was clicked.
  if (params.complianceFlag === "approaching") out = out.filter((r) => r.compliance_badge === "amber" || r.compliance_badge === "red");
  if (params.contactResolved === "yes") out = out.filter((r) => r.has_resolved_contact);
  if (params.contactResolved === "no") out = out.filter((r) => !r.has_resolved_contact);
  if (params.hasEmail === "yes") out = out.filter((r) => r.has_email);
  if (params.hasEmail === "no") out = out.filter((r) => !r.has_email);
  if (params.lowConfidenceEmail === "yes") out = out.filter((r) => r.has_low_confidence_email);
  if (params.lowConfidenceEmail === "no") out = out.filter((r) => !r.has_low_confidence_email);
  if (params.province) out = out.filter((r) => normalizeProvince(r.province) === params.province);
  if (params.brwaOverlap === "yes") out = out.filter((r) => r.has_brwa_evidence);
  if (params.brwaOverlap === "no") out = out.filter((r) => !r.has_brwa_evidence);
  if (params.sortKey) {
    const key = params.sortKey;
    out = [...out].sort((a, b) => (a[key] - b[key]) * (params.sortDir === "asc" ? 1 : -1));
  }
  return out;
}

/**
 * Encode/decode the filter state to/from real URL query params — the
 * same query string travels from the Candidates list to a candidate's
 * detail page (row click, row action) and back (the "Back to candidates"
 * link, prev/next), so "which curated set was I looking at" survives
 * every one of those transitions instead of resetting to the raw
 * unfiltered/unsorted 144.
 */
export function filterParamsToSearchParams(params: CandidateFilterParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (params.search) sp.set("q", params.search);
  if (params.richness) sp.set("richness", params.richness);
  if (params.status) sp.set("status", params.status);
  if (params.minNeed != null) sp.set("minNeed", String(params.minNeed));
  if (params.minCred != null) sp.set("minCred", String(params.minCred));
  if (params.complianceFlag) sp.set("compliance", params.complianceFlag);
  if (params.contactResolved) sp.set("contactResolved", params.contactResolved);
  if (params.hasEmail) sp.set("hasEmail", params.hasEmail);
  if (params.lowConfidenceEmail) sp.set("lowConfidenceEmail", params.lowConfidenceEmail);
  if (params.province) sp.set("province", params.province);
  if (params.brwaOverlap) sp.set("brwaOverlap", params.brwaOverlap);
  if (params.sortKey) {
    sp.set("sort", params.sortKey);
    sp.set("dir", params.sortDir);
  }
  return sp;
}

function parseIntParam(sp: URLSearchParams, key: string): number | null {
  const raw = sp.get(key);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const VALID_STATUS_VALUES = new Set(["not_contacted", "contacted", "follow_up_needed", "done", "rejected"]);

export function searchParamsToFilterParams(sp: URLSearchParams): CandidateFilterParams {
  const sortKey = sp.get("sort");
  const rawStatus = sp.get("status") ?? "";
  return {
    search: sp.get("q") ?? "",
    richness: sp.get("richness") ?? "",
    status: (VALID_STATUS_VALUES.has(rawStatus) ? rawStatus : "") as CandidateStatusValue | "",
    minNeed: parseIntParam(sp, "minNeed"),
    minCred: parseIntParam(sp, "minCred"),
    complianceFlag: sp.get("compliance") ?? "",
    contactResolved: sp.get("contactResolved") ?? "",
    hasEmail: sp.get("hasEmail") ?? "",
    lowConfidenceEmail: sp.get("lowConfidenceEmail") ?? "",
    province: sp.get("province") ?? "",
    brwaOverlap: sp.get("brwaOverlap") ?? "",
    sortKey: sortKey === "need_score" || sortKey === "credibility_score" ? sortKey : null,
    sortDir: sp.get("dir") === "asc" ? "asc" : "desc",
  };
}
