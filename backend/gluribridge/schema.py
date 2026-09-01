"""
The Unified Candidate Record — the one shape every downstream stage
(need-detection, contact resolution, scoring, dossier generation) reads.
Every source-specific normalizer's only job is to produce one of these.
"""
from dataclasses import dataclass, field, asdict
from typing import Optional, Literal
import uuid


@dataclass
class DocumentRef:
    title: str
    url: Optional[str]
    section: Optional[str] = None      # e.g. TECHNICAL / GENERAL (SRUK), doc type (Verra)
    sub_section: Optional[str] = None
    source: str = "unknown"            # which system this doc came from
    retrieved_at: Optional[str] = None


@dataclass
class FieldProvenance:
    source: str                        # 'sruk' | 'srn_ppi' | 'verra' | 'brwa' | 'news'
    source_tier: int                   # 0 (law/registry) .. 4 (news/promotional)
    retrieved_at: Optional[str] = None


@dataclass
class RegistrantContact:
    name: Optional[str] = None
    org: Optional[str] = None
    email: Optional[str] = None
    contact_source: Optional[str] = None   # 'sruk_registrant' | 'srn_ppi_registrant' | 'org_website' | 'news_mention' | None
    contact_source_url: Optional[str] = None
    contact_confidence: Optional[str] = None   # 'high' | 'medium' — only set for Tier B; Tier A is implicitly high
    # Audit trail (2026-08-31) — a Tier B (org-website) search CAN be run
    # against a candidate that already has a Tier A name-only contact (a
    # deliberate, manual override of resolve_contact_tier_b()'s normal
    # skip-if-Tier-A-already-resolved gate — see contact_resolution.py's
    # module docstring) specifically to check whether an email is ALSO
    # findable beyond the name Tier A already found. Without this, a
    # "no email on file" candidate looks identical whether Tier B was
    # never tried or was tried and genuinely found nothing — those two
    # states must never be indistinguishable to anyone reading the data
    # later. Purely additive/informational: neither field feeds scoring,
    # compliance, or recipient_status (still driven only by name/email
    # presence, see outreach.py's _recipient_status) — this is audit
    # trail only, same category as the existing field_sources mechanism.
    contact_tier_b_attempted_at: Optional[str] = None   # ISO date, set only when Tier B was explicitly run for this candidate
    contact_tier_b_attempt_result: Optional[str] = None   # human-readable outcome of that attempt
    # Phone/WhatsApp (2026-09-01) — did NOT exist before this; RegistrantContact
    # only ever carried name/email. Added ahead of running any real Tier C
    # (phone/WhatsApp-focused) search, per explicit instruction, so a found
    # number has somewhere honest to go rather than being discovered with no
    # field to write it to. Deliberately its own provenance trio, separate
    # from contact_source/contact_source_url/contact_confidence above — a
    # phone number found via a phone-specific search may come from a
    # different page/result than whatever resolved the name or email, and
    # collapsing both into one provenance field would misattribute one to
    # the other's source. Same non-negotiable verification bar (entity/
    # location match confirmed before trusting a hit) as every other tier.
    #
    # First real Tier C round (2026-09-01, manual — read/judged by hand
    # against 19 real candidates, not regex/LLM-decided) established the
    # real vocabulary these fields actually need, beyond what was guessed
    # when the fields were first added the same day:
    phone: Optional[str] = None
    # 'org_website' | 'news_mention' | 'org_social_media' | None — the
    # 'org_social_media' value added this round: a phone/WhatsApp found in
    # an org's own verified social-media bio/contact block (e.g. Facebook
    # Page "Contact info", Instagram bio) is the same self-identification
    # standard as an org's own website, just a different real-world venue
    # small/village-level orgs actually use — not a lesser source, a
    # different one.
    phone_source: Optional[str] = None
    phone_source_url: Optional[str] = None
    # 'high' | 'medium' | 'general_office_line' — the third value added
    # this round: a real, verified number that reaches the ORGANIZATION
    # generally (e.g. a national NGO's HQ landline from its own verified
    # bio) rather than a specific named individual or a WhatsApp-capable
    # mobile number. Deliberately not folded into 'high' (it's not
    # personal/direct) or 'medium' (it's not uncertain — the org match
    # itself is solid) — a genuinely different kind of contact, not a
    # weaker version of the other two.
    phone_confidence: Optional[str] = None
    # Tier C audit trail — same purpose and shape as the Tier B audit trail
    # above: distinguishes "a phone/WhatsApp search was never attempted for
    # this candidate" from "attempted, genuinely found nothing," so a blank
    # `phone` field is never ambiguous between the two. Purely additive/
    # informational, same category as contact_tier_b_attempted_at — doesn't
    # feed scoring, compliance, or recipient_status.
    contact_tier_c_attempted_at: Optional[str] = None   # ISO date, set only when a phone/WhatsApp search was explicitly run
    contact_tier_c_attempt_result: Optional[str] = None   # human-readable outcome of that attempt

    # "Public presence" (2026-09-01) — deliberately NOT a direct-contact
    # field, and never to be blended with phone/email/WhatsApp as if it were
    # a way to message someone. This is "can we find them online at all,"
    # a real fallback signal for a candidate where no phone/WhatsApp was
    # found — a website/Facebook/Instagram is something to mention IN an
    # outreach message (or use to sanity-check a candidate is real and
    # active), not something to send the message TO. Label distinctly in
    # any future UI ("public presence / find them online") for exactly
    # this reason — a future reader must never mistake a website URL for a
    # contact channel the way an email or phone is.
    #
    # Each of the three gets its own source/confidence (a candidate can
    # plausibly have a confirmed Instagram but an unconfirmed Facebook, so
    # per-field provenance matters) — but all three share ONE attempted-at/
    # result pair below, since in practice they're searched together as a
    # single fallback step per candidate, not three independent efforts.
    website_url: Optional[str] = None
    website_source: Optional[str] = None   # e.g. 'search_result' | 'social_media_bio' | 'directory_listing'
    website_confidence: Optional[str] = None   # 'high' | 'medium'
    facebook_url: Optional[str] = None
    facebook_source: Optional[str] = None
    facebook_confidence: Optional[str] = None
    instagram_handle: Optional[str] = None
    instagram_source: Optional[str] = None
    instagram_confidence: Optional[str] = None
    # ISO date, set only when the public-presence fallback search was
    # explicitly run for this candidate; result is a human-readable summary
    # across all three (e.g. "found Instagram, no Facebook or website" or
    # "nothing found") — same "never searched" vs. "searched, found
    # nothing" distinction as every other tier's audit trail.
    public_presence_attempted_at: Optional[str] = None
    public_presence_attempt_result: Optional[str] = None


@dataclass
class UnifiedCandidateRecord:
    # NOT STABLE ACROSS SEPARATE run_pipeline() INVOCATIONS — a fresh
    # uuid4() every time a record is constructed, and nothing in
    # normalize_sruk.py/normalize_verra.py/match.py overrides it
    # deterministically. Confirmed real (2026-08-31, during the
    # contact-resolution export-drift fix in pipeline.py/orchestrate.py):
    # the exact same real InfiniteEARTH/Verra-674 record got candidate_id
    # '9a965e64-...' in one run and '95100ce8-...' in an immediately-
    # following rerun on byte-identical raw data. Anything that needs to
    # recognize "the same real candidate" across two separate pipeline
    # runs — persisted per-candidate state (contact resolution, tracked/
    # partnership status, notes, bookmarked URLs) — must key on something
    # from registry_ids instead (e.g. verra_project_id, sruk_registry_no),
    # which comes straight from the raw registry file and IS stable
    # across reruns. See PROJECT_CONTEXT.md Section 6 (contact-resolution
    # export drift) for the full story, including a first draft of that
    # exact fix that keyed on candidate_id and silently matched nothing.
    candidate_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    # provenance of the record as a whole (the *primary* source that anchors identity)
    primary_source: str = "unknown"                 # 'sruk' | 'srn_ppi' | 'verra' | 'news'
    data_richness: Literal["rich", "corroborated", "thin"] = "rich"
    verification_status: str = "unverified"          # 'registry_confirmed' | 'corroborated' | 'unverified'

    # identity
    name: Optional[str] = None
    name_en: Optional[str] = None
    org: Optional[str] = None
    province: Optional[str] = None          # normalized to a canonical name (see province_lookup)
    district: Optional[str] = None
    country: str = "ID"

    # sector, kept explicit so the pipeline can filter to FOLU/AFOLU-only —
    # confirmed necessary on real data: SRUK's own registry mixes sectors
    # (e.g. a waste-management methane project shares SRUK's list endpoint
    # with forestry projects), and Verra's global catalog is not
    # forestry-only either (e.g. project 487 is a hydro plant).
    sector: Optional[str] = None

    # cross-registry identifiers — every one that applies gets filled
    registry_ids: dict = field(default_factory=lambda: {
        "sruk_registry_no": None,
        "srn_ppi_registry_no": None,
        "verra_project_id": None,
        "brwa_idx": None,
    })

    # Real, human-viewable public page for this candidate's OWN record on
    # each registry — distinct from registry_ids above (which are just the
    # identifiers) and from land_rights.brwa_overlap's own source_url
    # (which points at a DIFFERENT, nearby territory's page, not this
    # candidate's). Only ever set from a URL actually present in that
    # source's raw scraped data — never constructed from a guessed domain
    # pattern. Confirmed real for Verra (overview.public_comment_period_url,
    # e.g. https://projecthub.verra.org/publiccomment/project/1477).
    # Confirmed NOT present anywhere in SRUK/SRN-PPI's raw scraped data —
    # those stay None rather than a fabricated link.
    registry_source_urls: dict = field(default_factory=lambda: {
        "sruk": None, "srn_ppi": None, "verra": None,
    })

    # SRUK/SRN-PPI specific progress signal
    registration_stage: Optional[int] = None    # 1-5
    registration_momentum: Optional[str] = None  # 'low' | 'medium' | 'high'

    # carbon-track documents — DRAM (domestic) and DPP (international/Verra) are
    # legally separate tracks (Permenhut Pasal 11 vs Pasal 20-23) and must not
    # be conflated: a candidate can legitimately have one without the other.
    dram: Optional[dict] = None
    dpp: Optional[dict] = None
    lcam: Optional[dict] = None

    # geometry
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geometry: Optional[dict] = None         # GeoJSON, when available (Verra KML->GeoJSON, BRWA polygon)
    area_ha: Optional[float] = None
    # Set (and latitude/longitude nulled back out) by pipeline.py's
    # single-source geo plausibility guard — see match.py's
    # flag_implausible_single_source_geo() docstring. Distinct from simply
    # having no coordinate: this candidate DID have one, it was judged
    # implausible and discarded, and this says why — same "don't silently
    # drop, say so" principle as compliance.py's not_applicable reasons.
    geo_flagged_reason: Optional[str] = None

    # additional matching signals — description text and date range are often
    # MORE discriminating than the title/name when one source translates or
    # rephrases the name (confirmed on the real Katingan SRUK/SRN-PPI pair:
    # names differ across languages, but description text was byte-identical)
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    registered_at: Optional[str] = None   # when the record was CREATED in its source registry —
                                           # distinct from start_date (the project's own activity
                                           # start), needed to test Permenhut Pasal 61's transitional
                                           # window ("registered before the regulation took effect")

    # carbon status (Verra side)
    verra_status: Optional[str] = None
    verra_units: Optional[dict] = None      # issued/active/retired/cancelled/buffer
    # Verra's own raw activity-type code(s) for this project (e.g. "ARR",
    # "ARR,REDD,WRC") — comma-separated exactly as Verra's own overview
    # field gives it, never reformatted. This is a REAL structural signal,
    # not a keyword guess: activity_type.py uses it directly to detect
    # "Improved Forest Management" (code "IFM") and the "not applicable"
    # case (no forest-related code at all — confirmed real, 2026-08-31:
    # AgriCapture Southeast Asia Rice Methane Project carries only "ALM",
    # Agricultural Land Management, genuinely not a forestry land-use
    # activity). None for SRUK/SRN-PPI/news candidates — that registry
    # schema has no equivalent field.
    verra_afolu_activities: Optional[str] = None

    # documents (union across all merged sources)
    documents: list = field(default_factory=list)   # list[DocumentRef]

    # contact
    registrant_contact: RegistrantContact = field(default_factory=RegistrantContact)

    # land rights — uses Permenhut Pasal 6(1)'s 5 categories, not a generic flag
    land_rights_category: Optional[str] = None   # 'PBPH' | 'perhutanan_sosial' | 'hutan_adat' | 'hutan_hak' | 'PB_PJL_karbon' | None
    brwa_overlap: Optional[dict] = None          # {"brwa_idx":..., "territory_name":..., "distance_km":...} if spatially near/inside a customary territory

    # evidence trail
    field_sources: dict = field(default_factory=dict)   # field_name -> FieldProvenance(asdict)
    merged_from: list = field(default_factory=list)     # list of {source, source_id, match_score, match_status}
    documents_by_source_count: dict = field(default_factory=dict)
    news_evidence: list = field(default_factory=list)   # corroborating Tavily hits, never a standalone fact source

    def to_dict(self):
        d = asdict(self)
        return d
