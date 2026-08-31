"""
Normalizes the real Verra scraper output (the shape confirmed from your
142.json / 1477.json / 487.json samples: project_id, list_fields, detail_json,
overview, units_summary, documents, geo) into a UnifiedCandidateRecord.
"""
import re
from datetime import datetime, timezone
from .schema import UnifiedCandidateRecord, DocumentRef, RegistrantContact
from .normalize_sruk import PROVINCE_LOOKUP_ID_TO_EN, _is_real_coordinate


def _normalize_date(value):
    """
    Confirmed real inconsistency in Verra scraper output: most date fields
    come through as ISO strings ("2010-11-01"), but registration_date came
    through as a raw Unix epoch-millisecond integer (1586131200000) in at
    least one real record. Converts any epoch-ms int/float to an ISO date
    string; passes strings through unchanged. Applied defensively to every
    date field here, not just the one confirmed broken, since the same
    scraping inconsistency could plausibly affect other records/fields.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date().isoformat()
        except (ValueError, OverflowError, OSError):
            return value  # give back the raw value rather than crash — visible-wrong beats silently-dropped
    return value


def normalize_verra_record(raw: dict) -> UnifiedCandidateRecord:
    now = datetime.now(timezone.utc).isoformat()
    overview = raw.get("overview") or {}
    geo = raw.get("geo") or {}
    units = raw.get("units_summary") or {}

    rec = UnifiedCandidateRecord(primary_source="verra", data_richness="rich",
                                  verification_status="registry_confirmed")

    rec.name = overview.get("name")
    rec.org = overview.get("proponent")
    rec.sector = overview.get("sectoral_scope")
    rec.province = overview.get("state")   # already in English; matches PROVINCE_LOOKUP values
    rec.district = overview.get("city")
    rec.country = "ID" if (overview.get("country") or "").strip().lower().startswith("indonesia") else overview.get("country")

    lat, lon = geo.get("latitude"), geo.get("longitude")
    if _is_real_coordinate(lat, lon):
        rec.latitude, rec.longitude = lat, lon

    rec.description = overview.get("description")
    rec.start_date = _normalize_date(overview.get("estimated_start_date"))
    rec.end_date = _normalize_date(overview.get("crediting_period_end"))

    rec.registry_ids["verra_project_id"] = raw.get("project_id")
    # Real public Verra Project Hub page for this exact project — present
    # directly in the raw scrape (confirmed identical to detail_json's own
    # public_comment_url), not a constructed/guessed URL pattern.
    rec.registry_source_urls["verra"] = overview.get("public_comment_period_url")

    rec.verra_status = overview.get("status")
    rec.verra_afolu_activities = overview.get("afolu_activities")
    rec.verra_units = {
        "issued": units.get("vcus_issued"),
        "active": units.get("vcus_active"),
        "retired": units.get("vcus_retired"),
        "cancelled": units.get("vcus_cancelled"),
        "buffer": units.get("buffer_contributions"),
    }

    # DPP track, not DRAM — Verra projects go through the international/
    # non-SPE-GRK track (Permenhut Pasal 20-23). Recording that this project
    # has an active Verra registration IS the DPP-track equivalent signal;
    # need-detection must check this before flagging "no DRAM" as a gap.
    rec.dpp = {
        "standard": "VCS",
        "methodology": overview.get("methodology"),
        "methodology_version": overview.get("methodology_version"),
        "registration_date": _normalize_date(overview.get("registration_date")),
        "crediting_period_start": _normalize_date(overview.get("crediting_period_start")),
        "crediting_period_end": _normalize_date(overview.get("crediting_period_end")),
        # Verra's own independent validation body (e.g. "SCS Global Services").
        # This is a fact about VERRA's process, not Indonesia's Pasal 22
        # Ministry approval process — see dossier.py's dpp_validation_proxy
        # for how this is surfaced as unscored, hypothesis-tagged evidence,
        # never as a compliance signal (compliance.py's R024 stays unwired).
        "validator": overview.get("validator"),
    }

    docs = []
    for d in raw.get("documents") or []:
        docs.append(DocumentRef(
            title=d.get("name"),
            url=d.get("url"),
            section=d.get("type"),
            source="verra",
            retrieved_at=d.get("date"),
        ))
    rec.documents = docs
    rec.documents_by_source_count["verra"] = len(docs)

    # Verra gives no named individual contact — confirmed across all samples.
    rec.registrant_contact = RegistrantContact(
        name=None, org=overview.get("proponent"), contact_source=None
    )

    tier = 2  # independent international standard-setter
    for fname in ("name", "province", "district", "verra_status", "dpp"):
        rec.field_sources[fname] = {"source": "verra", "source_tier": tier, "retrieved_at": now}

    rec.merged_from.append({
        "source": "verra", "source_id": raw.get("project_id"),
        "match_score": 100, "match_status": "primary"
    })

    return rec
