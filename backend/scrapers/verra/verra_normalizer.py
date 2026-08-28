"""
verra_normalizer.py
====================
Maps a raw Verra/Platts project detail payload (from verra_api.fetch_project_detail)
into the target ProjectSnapshot schema. Unlike the earlier version of this
file, every field mapping here is confirmed against a REAL captured payload
(project VCS 2044, "Renewable Wind Power Project by Torrent Power") rather
than guessed key names -- see the comments on each field for exactly where
it came from.

Key structural notes about the real payload:
  - Most identifying/overview fields are at the TOP level of the response.
  - Per-vintage / per-unit data (dates as epoch-ms, coordinates, quantities,
    the estimated annual reduction volume) lives inside
    `mixedUnitList[i]` and its nested `mixedUnitAdditionalDetail`.
  - A project can apparently have more than one entry in `mixedUnitList`
    (different crediting periods/vintages) -- this normalizer uses the
    FIRST entry as "the" current snapshot, since that's what a project
    detail page would show, but keeps the full raw list under
    `detail_json` so nothing is lost if you need entry [1], [2], etc.
  - Document URLs (`document_link`) are RELATIVE paths (e.g.
    "/br-reg/services/processDocument/downloadDocumentById/1"). The base
    domain to prepend has NOT been confirmed live (no network access here)
    -- see DOCUMENT_BASE_URL below and verify before relying on it.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

# UNCONFIRMED: document_link paths look like they belong on the same host
# as the API itself, but this hasn't been verified with a real download.
# Try this first; if downloads 404, the correct base is probably
# https://registry.verra.org instead -- test both.
DOCUMENT_BASE_URL = "https://prod-us.api.platts.com/ci-raas-prod"

METHODOLOGY_VERSION_RE = re.compile(r"^(.*?)\s*\(Version\s+([^)]+)\)\s*$", re.IGNORECASE)


def _epoch_ms_to_date(ms: Optional[int]) -> Optional[str]:
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError, OverflowError):
        return None


def _blank_to_none(val: Any) -> Any:
    """The API uses "" for a lot of genuinely-empty fields (not null) --
    normalize both to None so downstream consumers only check one thing."""
    if isinstance(val, str) and val.strip() == "":
        return None
    return val


def _split_methodology(raw: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """'ACM0002 (Version 19)' -> ('ACM0002', '19')"""
    if not raw:
        return None, None
    m = METHODOLOGY_VERSION_RE.match(raw.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return raw.strip(), None


def _country_from_raw(raw: dict[str, Any], unit: dict[str, Any]) -> Optional[str]:
    """Country, kept as a full string exactly as the API gives it -- no
    comma-splitting, ever. Some country names legitimately contain commas
    in official UN-style form (e.g. "Tanzania, United Republic of", "Iran,
    Islamic Republic of", "Bolivia, Plurinational State of") -- these must
    be kept whole, not truncated to the token after the last comma.

    Preference order:
      1. raw["country_name"] (top level) -- often null in practice
      2. unit["country_name"] -- CONFIRMED present and correctly formatted
         in real payloads (e.g. "Tanzania, United Republic of") even when
         the top-level field is null
      3. the full address string, only as a last resort if neither
         country_name field is present at all
    """
    return (
        raw.get("country_name")
        or unit.get("country_name")
        or unit.get("publicViewAddress")
        or unit.get("address")
    )


def normalize(raw: dict[str, Any], stats: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """
    Builds the ProjectSnapshot schema from one raw API response.
    `raw` is exactly what verra_api.fetch_project_detail returns.

    `stats`, if provided, is the response from
    verra_api.fetch_project_statistics -- CONFIRMED as the real source for
    unit quantities (Issued/Active/Retired/Buffer/Unit_Cancelled), superseding
    the earlier guess of reading these from mixedUnitList (which was mostly
    null on the one test project available at the time -- a pipeline
    listing with no issued units yet). When `stats` is given, its
    `quantitiesByStateCode` values are used; the mixedUnitList-based guess
    is kept only as a fallback for when stats wasn't fetched at all.
    """
    project_id = raw.get("vcs_project_id") or str(raw.get("id") or "")

    mixed_units = raw.get("mixedUnitList") or []
    unit = mixed_units[0] if mixed_units else {}
    unit_detail = unit.get("mixedUnitAdditionalDetail") or {}

    methodology_name, methodology_version = _split_methodology(raw.get("methodologies"))

    country = _country_from_raw(raw, unit)

    overview = {
        "name": _blank_to_none(raw.get("project_name")),
        "status": _blank_to_none(raw.get("state_name")),  # human-readable; state_code has the machine form
        "proponent": _blank_to_none(raw.get("project_proponent_infos")),
        "authorized_rep_org": _blank_to_none(unit_detail.get("authorized_representative")),
        "sectoral_scope": _blank_to_none(raw.get("sectoral_scopes")),
        "afolu_activities": _blank_to_none(raw.get("afolu_names")),
        "methodology": methodology_name,
        "methodology_version": methodology_version,
        "estimated_annual_reductions": unit_detail.get("avg_annual_vol_vcu"),
        "validator": _blank_to_none(raw.get("validator_name") or unit.get("validator_name")),
        "country": _blank_to_none(country),
        "state": _blank_to_none(unit.get("province")),
        "city": _blank_to_none(unit.get("city")),
        "estimated_start_date": _blank_to_none(raw.get("project_start_date")),  # already "YYYY-MM-DD"
        "registration_date": _blank_to_none(raw.get("registration_date") or unit.get("registration_date")),
        "crediting_period_start": _epoch_ms_to_date(unit.get("period_start_date")),
        "crediting_period_end": _epoch_ms_to_date(unit.get("period_end_date")),
        "crediting_period_term": _blank_to_none(unit.get("period_term")),
        "public_comment_period_url": _blank_to_none(raw.get("public_comment_url")),
        "description": _blank_to_none(raw.get("project_description")),
    }

    quantities = (stats or {}).get("quantitiesByStateCode") or {}

    if quantities:
        # CONFIRMED real source (getAllStatistics) -- use directly.
        units_summary = {
            "vcus_issued": quantities.get("Issued"),
            "vcus_active": quantities.get("Active"),
            "vcus_retired": quantities.get("Retired"),
            "vcus_cancelled": quantities.get("Unit_Cancelled"),
            "buffer_contributions": quantities.get("Buffer"),
        }
    else:
        # Fallback only -- stats wasn't fetched (e.g. no internal
        # project_id available, or the stats call failed). These
        # mixedUnitList fields were an earlier guess and were null on the
        # only test project available at the time; kept as best-effort
        # rather than going straight to None.
        units_summary = {
            "vcus_issued": unit.get("issued_quantity") or unit.get("issuance_quantity"),
            "vcus_active": unit.get("remaining_quantity"),
            "vcus_retired": unit.get("retirement_quantity"),
            "vcus_cancelled": unit.get("cancelled_quantity"),
            "buffer_contributions": unit.get("permanenceBufferQuantity"),
        }

    documents = []
    for doc in (raw.get("documentList") or []):
        link = doc.get("document_link")
        doc_id = doc.get("id")
        url = None
        if link and doc_id:
            # CAUGHT IN TESTING: every document in a real sample payload had
            # the SAME document_link ("/br-reg/services/.../downloadDocumentById/1")
            # despite having distinct `id` values -- that trailing "1" looks
            # like a template placeholder, not a real per-document path.
            # Best guess: substitute the document's actual id in its place.
            # UNCONFIRMED without a live download test -- if these URLs
            # 404, try the untouched `link` as-is instead (see
            # doc["_raw_document_link"] kept below for exactly that).
            corrected_link = re.sub(r"downloadDocumentById/\d+$", f"downloadDocumentById/{doc_id}", link)
            url = DOCUMENT_BASE_URL + corrected_link
        elif link:
            url = DOCUMENT_BASE_URL + link
        documents.append({
            "name": doc.get("document_name") or doc.get("public_document_name"),
            "url": url,
            "type": doc.get("type_name"),  # API already gives a clean category, no guessing needed
            "date": doc.get("doc_modify_date"),
            "_raw_document_link": link,  # kept for debugging if the corrected URL turns out wrong
        })

    lat = unit.get("latitude")
    lng = unit.get("longitude")

    return {
        "project_id": project_id,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "source_url": None,  # set by caller (verra_crawler) to the actual API URL used
        "list_fields": None,  # set by caller if a matching Excel row exists
        "detail_json": raw,  # full untouched raw payload -- nothing is discarded
        "stats_json": stats,  # full untouched getAllStatistics payload, if fetched
        "overview": overview,
        "units_summary": units_summary,
        "documents": documents,
        "geo": {"latitude": lat, "longitude": lng} if (lat or lng) else None,
        "raw_html_path": None,
        "scrape_ok": True,
        "scrape_error": None,
    }