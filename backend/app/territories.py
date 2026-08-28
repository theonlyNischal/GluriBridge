"""
Real BRWA territory data for the map — reused parsing (gluribridge.
normalize_brwa.parse_brwa_list()), not reimplemented. Two endpoints only:
a lightweight list (name/province/policy_tier/has_geometry, no polygon —
1,756+ full polygons is ~149MB, never served in bulk) and one territory's
real geometry on demand. No fabricated layers (forest type, social
forestry, RSPO) — only what BRWA's own list + geometry data actually has.
"""
import json
import os

import orchestrate
from gluribridge.normalize_brwa import parse_brwa_list

DATA_RAW = orchestrate.DATA_RAW
WA_LIST_PATH = os.path.join(DATA_RAW, "brwa_profiles", "wa_list.json")
GEOJSON_DIR = os.path.join(DATA_RAW, "brwa_geojson", "geojson")

_cache = None  # {idx: parsed row}, loaded once per process — BRWA is
                # manual-cadence (rarely changes), no reason to re-parse
                # 2,283 rows on every request.


def _load():
    global _cache
    if _cache is not None:
        return _cache
    if not os.path.exists(WA_LIST_PATH):
        _cache = {}
        return _cache
    with open(WA_LIST_PATH, encoding="utf-8") as f:
        wa_list_json = json.load(f)
    _cache = parse_brwa_list(wa_list_json)
    return _cache


def has_geometry(idx: str) -> bool:
    return os.path.exists(os.path.join(GEOJSON_DIR, f"{idx}.geojson"))


def list_territories(search: str = None, province: str = None, limit: int = 200) -> list:
    lookup = _load()
    out = []
    search_lower = (search or "").strip().lower()
    province_lower = (province or "").strip().lower()
    for idx, row in lookup.items():
        if search_lower and search_lower not in (row["name"] or "").lower():
            continue
        if province_lower and province_lower not in (row["province"] or "").lower():
            continue
        out.append({
            "idx": idx,
            "name": row["name"],
            "province": row["province"],
            "district": row["district"],
            "area_ha": row["area_ha"],
            "policy_tier": row["policy_tier"],
            "verification_maturity": row["verification_maturity"],
            "has_geometry": has_geometry(idx),
        })
        if len(out) >= limit:
            break
    return out


def get_territory_geometry(idx: str) -> dict | None:
    path = os.path.join(GEOJSON_DIR, f"{idx}.geojson")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def get_territory(idx: str) -> dict | None:
    lookup = _load()
    row = lookup.get(idx)
    if not row:
        return None
    return {**row, "has_geometry": has_geometry(idx)}


def count_stats() -> dict:
    """Real, already-known totals (documented in gluribridge/README.md's
    Open Items — the ~77% geometry ceiling), just exposed over the API
    instead of only living in a doc. `_load()` is cached in-process, and
    the geometry check is a cheap local file-exists per idx (~2,283 stat()
    calls) — no bulk polygon read, same cost class as `list_territories`.
    """
    lookup = _load()
    total = len(lookup)
    with_geometry = sum(1 for idx in lookup if has_geometry(idx))
    return {"total": total, "with_geometry": with_geometry}
