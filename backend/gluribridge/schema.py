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


@dataclass
class UnifiedCandidateRecord:
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
