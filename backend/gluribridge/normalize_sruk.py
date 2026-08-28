"""
Normalizes a raw SRUK or SRN-PPI detail record into a UnifiedCandidateRecord.

Handles both confirmed schema variants defensively (never assumes one fixed
key set — confirmed necessary from real samples: 'project_description_general'
vs 'general_purpose', 'project_name_en' vs 'title_en', 'dram.validation_report_link'
vs 'dram.dram_file_validation', 'approvals.registration_date' vs
'approvals.igrk_stage_2_approved_at').

Source disambiguation: registrant username prefix is the strongest signal
found so far ('sruk_...' vs 'srn.*') — confirmed on the real Katingan pair.
Falls back to an explicit `source_hint` param when the username doesn't
carry the prefix (don't assume every record will).
"""
from datetime import datetime, timezone
from .schema import UnifiedCandidateRecord, DocumentRef, RegistrantContact

# Known dummy/placeholder coordinates seen across multiple, unrelated real
# projects (Garut, Cianjur, Katingan Mentaya SRN-PPI record) — never treat
# these as real geometry.
KNOWN_PLACEHOLDER_COORDS = {
    (-2.4, 118.8271),
}

PROVINCE_LOOKUP_ID_TO_EN = {
    "KALIMANTAN TENGAH": "Central Kalimantan",
    "JAWA BARAT": "West Java",
    "RIAU": "Riau",
    # extend as more provinces are encountered in real data
}


def _get(d, *keys, default=None):
    """Try each key in order, return the first non-None hit. Handles schema variance."""
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return default


def _is_real_coordinate(lat, lon):
    if lat is None or lon is None:
        return False
    try:
        lat_f, lon_f = round(float(lat), 4), round(float(lon), 4)
    except (TypeError, ValueError):
        return False
    return (lat_f, lon_f) not in KNOWN_PLACEHOLDER_COORDS


def _detect_source(raw: dict, source_hint: str = None) -> str:
    """
    Best-effort disambiguation of SRUK-native vs SRN-PPI-origin records that
    live in the same list/detail shape. Confirmed signal: username prefix.
    """
    if source_hint:
        return source_hint
    username = (raw.get("user") or {}).get("username", "") or ""
    if username.lower().startswith("sruk"):
        return "sruk"
    if username.lower().startswith("srn"):
        return "srn_ppi"
    return "sruk"  # default assumption; flag for manual review downstream if unsure


def _momentum(workflow_steps) -> str:
    """
    Crude first-pass momentum heuristic: how many stages have any activity
    (approved/sent) vs. sitting untouched. Refine once more real timing data
    (multiple snapshots over time) is available — this is a placeholder
    that at least distinguishes 'nothing happening' from 'actively moving'.
    """
    if not workflow_steps:
        return None
    active_or_done = sum(
        1 for s in workflow_steps
        if s.get("status") in ("completed", "active") and s.get("latest_status")
    )
    if active_or_done >= 2:
        return "high"
    if active_or_done == 1:
        return "medium"
    return "low"


def normalize_sruk_record(raw: dict, source_hint: str = None) -> UnifiedCandidateRecord:
    source = _detect_source(raw, source_hint)
    now = datetime.now(timezone.utc).isoformat()

    rec = UnifiedCandidateRecord(primary_source=source, data_richness="rich",
                                  verification_status="registry_confirmed")

    rec.name = raw.get("title")
    rec.name_en = _get(raw, "project_name_en", "title_en")
    rec.org = (raw.get("responsible") or {}).get("name")
    sectors = raw.get("sectors") or []
    rec.sector = sectors[0].get("name") if sectors else None

    loc = raw.get("location") or {}
    province_obj = loc.get("province")
    rec.province = province_obj.get("name") if isinstance(province_obj, dict) else province_obj
    district_obj = loc.get("district")
    rec.district = district_obj.get("name") if isinstance(district_obj, dict) else district_obj

    lat, lon = loc.get("latitude"), loc.get("longitude")
    if _is_real_coordinate(lat, lon):
        rec.latitude, rec.longitude = float(lat), float(lon)
    # else: leave None — a placeholder is not "no data", but treating it as
    # real would actively corrupt geo-matching (see Katingan Row 2 case).

    rec.description = _get(raw, "project_description_general", "general_purpose")
    rec.start_date = raw.get("start_date")
    rec.end_date = raw.get("end_date")
    rec.registered_at = raw.get("created_at")

    reg_no = raw.get("program_code")
    if source == "srn_ppi":
        rec.registry_ids["srn_ppi_registry_no"] = reg_no
    else:
        rec.registry_ids["sruk_registry_no"] = reg_no

    rec.registration_stage = raw.get("stage")
    rec.registration_momentum = _momentum(raw.get("workflow_steps"))

    # DRAM — domestic track only. Do NOT treat a missing DRAM as an
    # automatic red flag; a DPP-track (international/Verra) candidate is
    # expected to have no DRAM at all (Permenhut Pasal 20-23).
    rec.dram = raw.get("dram")
    rec.lcam = raw.get("lcam")

    user = raw.get("user") or {}
    rec.registrant_contact = RegistrantContact(
        name=user.get("name"),
        org=user.get("organization_name"),
        contact_source=f"{source}_registrant" if user.get("name") else None,
    )

    docs = []
    for d in raw.get("program_documents") or []:
        docs.append(DocumentRef(
            title=d.get("title"),
            url=d.get("file_url"),
            section=d.get("section"),
            sub_section=d.get("sub_section"),
            source=source,
            retrieved_at=d.get("created_at"),
        ))
    rec.documents = docs
    rec.documents_by_source_count[source] = len(docs)

    # field-level provenance for the handful of fields most likely to be cited directly
    tier = 1  # government-operated registry
    for fname in ("name", "province", "district", "registration_stage", "dram"):
        rec.field_sources[fname] = {"source": source, "source_tier": tier, "retrieved_at": now}

    rec.merged_from.append({
        "source": source, "source_id": reg_no, "match_score": 100, "match_status": "primary"
    })

    return rec
