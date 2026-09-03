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

// Per-source freshness (2026-09-03, Sync page) — exactly
// orchestrate.check_all_freshness()'s real shape, already computed by
// reading each source's own fetched_at-style field; nothing derived
// here. age_days/fetched_at are null when a source has no raw data on
// file yet at all (a genuinely different state from "stale").
export interface SourceFreshness {
  fetched_at: string | null;
  timestamp_source: string | null;
  note: string | null;
  age_days: number | null;
}

export type SyncSource = "sruk" | "srn_ppi" | "verra" | "brwa";

export interface FreezeInfo {
  frozen_at: string;
  reason: string;
}

export interface StatsResponse {
  last_registry_refresh: string | null;
  last_full_refresh_with_news: string | null;
  news_data_stale: boolean;
  news_data_stale_message: string | null;
  candidate_count_in_db: number;
  freshness: Record<SyncSource, SourceFreshness>;
  freeze: FreezeInfo | null;
  last_db_load_at: string | null;
  // Real, live check — not cached — whether TAVILY_API_KEY is set on the
  // backend right now (2026-09-03, Sync page).
  tavily_configured: boolean;
  // Real, already-known totals (see gluribridge/README.md's Open Items —
  // the ~77% geometry ceiling is a confirmed real data-source limit, not
  // an in-progress number).
  brwa_territories: { total: number; with_geometry: number };
  // The real pipeline_stats.json content, verbatim (see
  // app/routes.py's get_stats() — this is exactly what the last real
  // run_pipeline() call recorded, not derived or re-computed here).
  // Optional/nullable since a fresh DB with no export yet has none.
  pipeline_stats: {
    sruk_and_srn_ppi_input: number;
    verra_input: number;
    final_candidate_count: number;
    brwa_territories_available: number;
    brwa_territories_in_full_list: number;
    candidates_with_brwa_overlap: number;
    news_queries_run: number;
    news_hits_processed: number;
    news_thin_candidates_created: number;
    news_corroborations: number;
    tier_b_contact_attempted: number;
    tier_b_contact_resolved: number;
  } | null;
}

// One real refresh attempt (2026-09-03, Sync page) — db.get_refresh_log()'s
// exact shape, most-recent-first, append-only (a failed/frozen attempt
// leaves a real row too, not just successes).
export interface RefreshLogEntry {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "ok" | "frozen" | "error";
  with_news: boolean;
  used_news: boolean;
  triggered_by: "manual" | "scheduler";
  detail: string | null;
}

// Result of POST /refresh (2026-09-03, fire-and-forget) — "started" is
// the only success shape now; the real outcome ('ok'/'error') is found
// later via GET /refresh-log once GET /refresh-status reports the
// refresh is no longer in progress. "frozen"/"already in progress"
// arrive as a 423/409's response body instead (api.ts throws ApiError,
// callers catch it there).
export interface RefreshResult {
  status: "started";
}

export type SourceProgress = "pending" | "skipped" | "running" | "done" | "failed";

// Live progress of the one refresh currently running, if any
// (2026-09-03) — scheduler.get_current_refresh()'s exact shape. null
// when nothing is in progress. Polled by the Sync page while a refresh
// is active; real state mutated in place as run_refresh_cycle() moves
// through each step, never estimated/simulated.
export interface RefreshStatus {
  in_progress: boolean;
  started_at: string;
  with_news: boolean;
  triggered_by: "manual" | "scheduler";
  // Set when this refresh was scoped to exactly one source (a Sync page
  // per-source button) — null for a normal all-4-sources refresh.
  only: SyncSource | null;
  // "starting" | a SyncSource name (currently scraping/just finished
  // that source) | "pipeline" (normalizing/scoring/news) | "loading"
  // (writing the result into the live DB)
  phase: string;
  source_status: Record<SyncSource, SourceProgress>;
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

// Real activity-type classification (2026-08-31) — see
// backend/gluribridge/activity_type.py's module docstring for the real
// classification test this is built from. A candidate can carry 0, 1, or
// several of these 5 real tags at once (multi-tag is deliberate, not a
// shortcut — confirmed real: 11 of 29 classifiable titles in the original
// test carried 2-3 tags simultaneously). "Unclassified" (empty
// categories, not_applicable false) and "Not applicable" (not_applicable
// true) are two DISTINCT honest states, never blended into one generic
// "Other" — see ActivityTypeBadges.tsx.
export type ActivityCategory = "Peatland" | "Reforestation" | "Social forestry" | "Conservation" | "Improved Forest Management";

export interface ActivityTypeResult {
  categories: ActivityCategory[];
  not_applicable: boolean;
  not_applicable_reason: string | null;
}

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
  // (86 of 144 real candidates as of 2026-09-01), which is NOT "ready for
  // outreach." True only when a real email is on file AND
  // contact_confidence is "high" — see has_low_confidence_email for the
  // real-but-weaker matches this deliberately excludes.
  has_email: boolean;
  // A real email is on file, but contact_confidence is NOT "high" (a
  // genuine Tier B match, not a false positive, just not clearly tied
  // to this specific candidate — e.g. a huge conglomerate's generic
  // contact page). Kept as its own distinct bucket, never silently
  // merged into has_email or dropped from the record.
  has_low_confidence_email: boolean;
  // True only when a Tier B org-website search was actually run for this
  // candidate (2026-08-31 audit trail) — distinguishes "never searched for
  // an email" from "searched and found nothing" in contact-readiness text.
  contact_tier_b_attempted: boolean;
  // Same pattern, for phone/WhatsApp (2026-09-01) — first real Tier C round
  // (2026-09-01) resolved 3 of 144 real candidates; the rest are still
  // false/unset, not yet searched.
  has_phone: boolean;
  contact_tier_c_attempted: boolean;
  // Public presence (2026-09-01) — a website/Facebook/Instagram found for
  // this candidate, deliberately NOT a direct-contact signal like has_phone
  // /has_email above (never blend into contact-readiness counts). Schema/
  // plumbing added ahead of any real search — both false/unset for every
  // real candidate until that runs.
  has_public_presence: boolean;
  public_presence_attempted: boolean;
  // Real activity-type classification, list form (see ActivityCategory
  // above) — always [] when activity_not_applicable is true. An empty
  // list with activity_not_applicable false is the distinct "unclassified"
  // state.
  activity_categories: ActivityCategory[];
  activity_not_applicable: boolean;
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
  contact: {
    name: string | null; org: string | null; email: string | null; contact_source: string | null;
    contact_source_url: string | null; contact_confidence: string | null;
    // Audit trail (2026-08-31) — present only when a Tier B org-website
    // search was explicitly run for this candidate; absent (not just null)
    // otherwise. See RegistrantContact.contact_tier_b_attempted_at.
    contact_tier_b_attempted_at?: string | null; contact_tier_b_attempt_result?: string | null;
    // Phone/WhatsApp (2026-09-01) — schema/plumbing added ahead of any real
    // Tier C search running; own provenance trio, deliberately separate
    // from contact_source/contact_source_url/contact_confidence above (a
    // phone number may come from a different search/page than the name or
    // email did). See RegistrantContact for the full reasoning.
    phone?: string | null; phone_source?: string | null; phone_source_url?: string | null; phone_confidence?: string | null;
    contact_tier_c_attempted_at?: string | null; contact_tier_c_attempt_result?: string | null;
    // Public presence (2026-09-01) — deliberately NOT a direct-contact
    // field, never render alongside phone/email as if it were a way to
    // message someone. See RegistrantContact for the full reasoning.
    website_url?: string | null; website_source?: string | null; website_confidence?: string | null;
    facebook_url?: string | null; facebook_source?: string | null; facebook_confidence?: string | null;
    instagram_handle?: string | null; instagram_source?: string | null; instagram_confidence?: string | null;
    public_presence_attempted_at?: string | null; public_presence_attempt_result?: string | null;
  } | null;
  activity_type: ActivityTypeResult;
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
