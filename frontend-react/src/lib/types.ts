// Mirrors backend/gluribridge/export.py's detail_view() output exactly —
// this file has no fields the API doesn't really return, and no field is
// invented to make a component's props look nicer. If a type here is
// wrong, the bug is in this file, not a reason to reshape real API data.

export type EvidenceLevel = "fact" | "hypothesis";

export interface TerritoryListEntry {
  idx: string;
  name: string;
  province: string | null;
  district: string | null;
  area_ha: number | null;
  policy_tier: string;
  verification_maturity: string;
  has_geometry: boolean;
}

export interface StatsResponse {
  last_registry_refresh: string | null;
  last_full_refresh_with_news: string | null;
  news_data_stale: boolean;
  news_data_stale_message: string | null;
  // Real, already-known totals (see gluribridge/README.md's Open Items —
  // the ~77% geometry ceiling is a confirmed real data-source limit, not
  // an in-progress number).
  brwa_territories: { total: number; with_geometry: number };
}

// Result of POST /candidates/{id}/status — mirrors db.set_status()'s
// return shape exactly, history included so the caller never needs a
// second round-trip just to show what it appended.
export interface StatusUpdateResult {
  status: CandidateStatusValue;
  status_changed_at: string | null;
  note: string | null;
  history: StatusHistoryEntry[];
}

export interface Citation {
  source_type: string;
  url: string | null;
  retrieved_at: string | null;
  note: string | null;
}

export interface ReasonEntry {
  rule?: string;
  // Genuinely absent on credibility_components reasons (registry_status/
  // land_rights/geospatial/contactability) — those are registry-confirmed
  // facts, not fact/hypothesis-adjudicated need-signal claims, so the
  // backend never tags them. Present on need_detection_reasons,
  // dossier.why_gluri, and news_evidence. Optional here on purpose —
  // treating a missing tag as "hypothesis" would fabricate uncertainty
  // the backend never asserted.
  evidence_level?: EvidenceLevel;
  text: string;
  citation: Citation | null;
}

export interface ScoreComponent {
  points: number;
  max: number;
  reasons: ReasonEntry[];
}

export type ComplianceBadgeValue = "green" | "amber" | "red" | "not_applicable";

export interface ComplianceRule {
  rule_id: string;
  badge: ComplianceBadgeValue;
  reason: string;
  deadline: string | null;
  days_until_deadline: number | null;
  applicable?: boolean;
}

export interface ComplianceResult extends ComplianceRule {
  other_rules: ComplianceRule[];
  not_wired_rules: { rule_id: string; pasal: string; reason: string }[];
}

export type ScoreLabel = "opportunity" | "confirmed" | "strong_lead" | "early_signal" | "mixed";

// Real 5-value outreach-status enum (backend/app/db.py's VALID_STATUSES) —
// replaces the original single `contacted` boolean (2026-08-28). None of
// these are inherently "bad" — not_contacted just means no action has
// been taken yet, follow_up_needed means a conversation is in progress,
// not stalled.
export type CandidateStatusValue = "not_contacted" | "contacted" | "follow_up_needed" | "done" | "rejected";

export interface StatusHistoryEntry {
  status: CandidateStatusValue;
  changed_at: string;
  note: string | null;
}

export interface CandidateListRow {
  candidate_id: string;
  name: string;
  org: string | null;
  province: string | null;
  district: string | null;
  country: string | null;
  sector: string | null;
  sources: string[];
  data_richness: "rich" | "corroborated" | "thin";
  verification_status: string;
  need_score: number;
  credibility_score: number;
  credibility_capped: boolean;
  score_label: ScoreLabel;
  compliance_badge: ComplianceBadgeValue;
  has_brwa_evidence: boolean;
  // The specific real BRWA territory to fetch geometry for (via the
  // existing GET /territories/{idx}/geometry), when has_brwa_evidence is
  // true. null otherwise — never guessed or constructed client-side.
  brwa_idx: string | null;
  land_rights_category: string | null;
  has_named_contact: boolean;
  has_resolved_contact: boolean;
  // Distinct from has_resolved_contact (2026-08-31 audit) — resolved
  // contact is true for a Tier A registrant NAME with no email at all
  // (83 of 144 real candidates today), which is NOT "ready for
  // outreach." True only when a real email address is actually on
  // file (currently just the real Tier B / org_website resolutions).
  has_email: boolean;
  document_count: number;
  news_evidence_count: number;
  status: CandidateStatusValue;
  status_changed_at: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface BRWAOverlap {
  brwa_idx: string;
  territory_name: string;
  relationship: "inside" | "near";
  distance_km: number;
  policy_tier: string;
  verification_maturity: string;
  legal_documents: { description: string; pdf_url: string }[];
  // Real BRWA profile page for this territory (e.g. https://brwa.id/profil/3145)
  // when the territory was built from a scraped profile; null for the
  // geometry-only bulk-load path, which never fetched one — never guessed.
  territory_source_url: string | null;
}

export interface DocumentRef {
  title: string;
  url: string;
  section: string | null;
  sub_section: string | null;
  source: string;
  retrieved_at: string | null;
}

export interface NewsEvidence {
  title: string;
  url: string;
  match_score: number;
  evidence_level: EvidenceLevel;
}

export interface MergeHistoryEntry {
  source: string;
  source_id: string;
  match_score: number;
  match_status: string;
}

export interface OutreachStructured {
  candidate_id: string;
  recipient_status: "ready" | "name_only_no_email" | "email_only_no_name" | "insufficient_contact";
  subject: string;
  subject_en: string;
  subject_id: string;
  body: string;
  body_en: string;
  body_id: string;
  to: string | null;
  warnings: string[];
}

export interface DossierStructured {
  candidate_id: string;
  header: string;
  why_gluri: ReasonEntry[];
  land_and_regulatory: { land_rights_text: string; land_rights_citation: Citation | null; compliance_text: string } | null;
  contact_route: string;
  suggested_poc: string;
  next_questions: string[];
  dpp_validation_proxy: ReasonEntry[];
}

export interface CandidateDetail {
  candidate_id: string;
  identity: {
    name: string;
    name_en: string | null;
    org: string | null;
    sector: string | null;
    province: string | null;
    district: string | null;
    country: string | null;
    registry_ids: { sruk_registry_no: string | null; srn_ppi_registry_no: string | null; verra_project_id: string | null; brwa_idx: string | null };
    // Real per-registry public page for THIS candidate's own record —
    // only ever populated from a URL actually present in that source's
    // raw data (currently just Verra; SRUK/SRN-PPI have none to link to).
    registry_source_urls: { sruk: string | null; srn_ppi: string | null; verra: string | null };
    registration_stage: number | null;
    registration_momentum: string | null;
    data_richness: "rich" | "corroborated" | "thin";
    verification_status: string;
  };
  location: {
    latitude: number | null;
    longitude: number | null;
    has_full_geometry: boolean;
    area_ha: number | null;
    geo_flagged_reason: string | null;
  };
  identity_resolution: { merge_history: MergeHistoryEntry[] };
  carbon_tracks: { dram: unknown; dpp: Record<string, unknown> | null; lcam: unknown; verra_status: string | null; verra_units: unknown };
  documents: DocumentRef[];
  contact: { name: string | null; org: string | null; email: string | null; contact_source: string | null; contact_source_url: string | null; contact_confidence: string | null } | null;
  land_rights: { land_rights_category: string | null; brwa_overlap: BRWAOverlap | null };
  news_evidence: NewsEvidence[];
  scoring: {
    need_score: number;
    credibility_score: number;
    credibility_capped: boolean;
    score_label: ScoreLabel;
    compliance: ComplianceResult;
    need_detection_reasons: ReasonEntry[];
    credibility_components: { registry_status: ScoreComponent; land_rights: ScoreComponent; geospatial: ScoreComponent; contactability: ScoreComponent };
  };
  dossier: { structured: DossierStructured; markdown: string };
  outreach: { structured: OutreachStructured; text: string } | null;
  status: { status: CandidateStatusValue; status_changed_at: string | null; note: string | null; history: StatusHistoryEntry[] };
}
