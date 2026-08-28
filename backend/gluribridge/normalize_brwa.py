"""
BRWA (customary/indigenous territory registry) — evidence-attachment layer,
not an identity-joinable source. A BRWA territory never originates its own
candidate; it attaches as land-rights evidence to a project candidate based
on spatial proximity/overlap, never on name/org matching.
"""
import re
import json
from dataclasses import dataclass, field
from shapely.geometry import shape, Point
from .schema import UnifiedCandidateRecord
from .normalize_sruk import PROVINCE_LOOKUP_ID_TO_EN

_PROVINCE_LOOKUP_EN_TO_ID = {v.lower(): k for k, v in PROVINCE_LOOKUP_ID_TO_EN.items()}


def translate_province_to_indonesian(province: str) -> str:
    """
    Translates an English province name (as Verra stores it) to the
    Indonesian name BRWA uses, when known. Returns the input unchanged if
    no mapping exists (extend PROVINCE_LOOKUP_ID_TO_EN in normalize_sruk.py
    as more provinces are encountered — currently only 3 entries, confirmed
    incomplete). Passing an already-Indonesian name through is harmless —
    it just won't be found in this EN->ID table and returns unchanged.
    """
    if not province:
        return province
    return _PROVINCE_LOOKUP_EN_TO_ID.get(province.strip().lower(), province)

# BRWA's OWN list-level classification is authoritative — confirmed against
# 2283 real territories, not inferred. Three tiers, by legal weight:
#   'penetapan'  — a specific government determination of this territory's
#                   status (e.g. a Ministry decree naming it directly) —
#                   this is what Permenhut Pasal 6(1)(c) actually requires.
#   'pengaturan' — a general regional/provincial regulation recognizing
#                   customary communities broadly, WITHOUT a specific
#                   determination for this territory (confirmed real case:
#                   territory 87 has only a provincial Perda, not a decree
#                   naming it — BRWA itself tags this as the middle tier,
#                   not the strong one, and the previous regex-only
#                   classifier had no way to distinguish this from a
#                   genuine 'penetapan' case except by accident).
#   'belum_ada'  — no policy document at all yet.
KEBIJAKAN_TIER_MAP = {
    "penetapan": "penetapan",
    "pengaturan": "pengaturan",
    "belum ada": "belum_ada",
}

# BRWA's own 10-stage verification funnel, confirmed from the real list —
# grouped into a simplified maturity bucket. This is a SEPARATE axis from
# the legal-recognition tier above: a territory can be far along in BRWA's
# own internal verification while still having no formal government
# determination, or vice versa.
BRWA_STATUS_MATURITY = {
    "Registrasi Baru": "early",
    "Persiapan Verifikasi 1": "early",
    "Teregistrasi": "mid",
    "Pemeriksaan Data": "mid",
    "Terverifikasi": "mid",
    "Pasca Verifikasi 1": "mid",
    "Pengamatan Tindak Lanjut": "mid",
    "Persiapan Sertifikasi": "mid",
    "Tersertifikasi": "advanced",
    "Pasca Sertifikasi": "advanced",
}


def _parse_area_ha(luas_str: str):
    if not luas_str:
        return None
    m = re.search(r"([\d.,]+)", luas_str)
    if not m:
        return None
    num = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(num)
    except ValueError:
        return None


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s or "").strip()


def _extract_badge_label(html_fragment: str) -> str:
    """Pulls the trailing human-readable label out of a BRWA status/kebijakan
    badge fragment, e.g. "<span class='badge...'>R</span> <span>Teregistrasi</span>"
    -> "Teregistrasi"."""
    matches = re.findall(r"<span[^>]*>([^<]+)</span>", html_fragment or "")
    return matches[-1].strip() if matches else (html_fragment or "").strip()


def parse_brwa_list(wa_list_json: dict) -> dict:
    """
    Parses the full BRWA list response into a lookup dict keyed by idx.
    Used both as (a) the authoritative source for legal-recognition tier and
    verification-maturity, and (b) a cheap province/district pre-filter
    before ever fetching a full profile + geometry — necessary given the
    real scale here (2283 territories; fetching full detail for all of them
    up front isn't necessary or cheap).
    """
    lookup = {}
    for row in wa_list_json.get("data", []):
        idx = row.get("idx")
        kebijakan_label = _extract_badge_label(row.get("kebijakan", "")).lower()
        status_label = _extract_badge_label(row.get("status", ""))
        lookup[idx] = {
            "idx": idx,
            "name": _strip_html(row.get("nama_kewilayahan", "")),
            "province": row.get("id_propinsi"),
            "district": row.get("id_kabupaten"),
            "area_ha": _parse_area_ha(row.get("luas")),
            "population": row.get("jml_penduduk"),
            "registration_date": row.get("tanggal_pendaftaran"),
            "policy_tier": KEBIJAKAN_TIER_MAP.get(kebijakan_label, "belum_ada"),
            "verification_status_label": status_label,
            "verification_maturity": BRWA_STATUS_MATURITY.get(status_label, "early"),
        }
    return lookup


def prefilter_by_admin(province: str, district: str, brwa_list_lookup: dict) -> list:
    """
    Cheap coarse filter: which BRWA territories share the candidate's
    province (and ideally district) BEFORE fetching any full profile/geometry.
    Necessary given 2283 total territories — geometry-first filtering would
    mean fetching all of them just to rule most out.

    BRWA's own province field is always Indonesian-language (e.g. "Kalimantan
    Tengah"). SRUK candidates already store the Indonesian name and match
    directly. Verra-sourced candidates store the English name (e.g. "Central
    Kalimantan") — confirmed on real data that this returns ZERO matches
    without translation (127 real hits for the Indonesian name vs 0 for the
    English one on the same real province). Callers passing a Verra-sourced
    candidate's province MUST translate it to Indonesian first — see
    normalize_sruk.PROVINCE_LOOKUP_ID_TO_EN (reverse lookup) — this function
    does not guess which direction the input is in.
    """
    if not province:
        return []
    province_norm = province.strip().lower()
    hits = [t for t in brwa_list_lookup.values() if (t["province"] or "").strip().lower() == province_norm]
    if district:
        district_norm = district.strip().lower()
        district_hits = [t for t in hits if (t["district"] or "").strip().lower() == district_norm]
        if district_hits:
            return district_hits  # narrower is better when available
    return hits


@dataclass
class BRWATerritory:
    idx: str
    name: str
    province: str = None
    district: str = None
    subdistrict: str = None
    area_ha: float = None
    geometry: object = None            # shapely geometry
    legal_documents: list = field(default_factory=list)   # [{description, pdf_url}]
    policy_tier: str = "belum_ada"                # 'penetapan' | 'pengaturan' | 'belum_ada'
    verification_maturity: str = "early"           # 'early' | 'mid' | 'advanced'
    source_url: str = None


def load_brwa_directory(geojson_dir: str, brwa_lookup: dict, profile_dir: str = None, quiet: bool = True) -> dict:
    """
    Bulk-loads every {idx}.geojson (+ matching {idx}.json profile, if
    present) into a dict of idx -> BRWATerritory. Built for the real scale
    this project actually has — geometry files are large and typically far
    fewer than profile files (confirmed real case: 2283 profiles delivered
    for every territory, but only a subset of geojson files at a time, since
    the full geometry set is too heavy to move all at once). A
    hand-enumerated list of (profile, geojson) tuples doesn't work at this
    size or under that constraint.

    profile_dir defaults to geojson_dir (single merged folder) but can be a
    separate directory — supports the realistic case where profiles and
    geometries are delivered/stored separately, which is how a real crawler
    would keep raw outputs organized in the first place.

    The profile JSON is used when present (for legal_documents — the actual
    citable decree/regulation PDF URLs) but is NOT required: if only the
    geojson exists for a given idx, a territory is still built using
    brwa_lookup's list-level data (name, province, district, area_ha,
    policy_tier, verification_maturity) with an empty legal_documents list.
    This matters because policy_tier — the field that actually drives
    land_rights_category — comes from the list either way, not from the
    profile's kebijakan_table; a missing profile should degrade evidence
    detail, not correctness of the tier itself.
    """
    import glob
    import os

    profile_dir = profile_dir or geojson_dir
    territories = {}
    skipped = []

    geojson_paths = glob.glob(os.path.join(geojson_dir, "*.geojson"))
    for geojson_path in geojson_paths:
        idx = os.path.splitext(os.path.basename(geojson_path))[0]
        list_entry = brwa_lookup.get(idx)
        if list_entry is None:
            skipped.append((idx, "not found in brwa_lookup (list data missing for this idx)"))
            continue

        try:
            with open(geojson_path, encoding="utf-8") as f:
                geojson = json.load(f)
        except Exception as e:
            skipped.append((idx, f"geojson load failed: {e}"))
            continue

        profile_path = os.path.join(profile_dir, f"{idx}.json")
        profile = {}
        if os.path.exists(profile_path):
            try:
                with open(profile_path, encoding="utf-8") as f:
                    profile = json.load(f)
            except Exception as e:
                if not quiet:
                    print(f"  idx={idx}: profile exists but failed to parse ({e}); using list data only")

        territory = load_brwa_territory(profile or {"idx": idx}, geojson, list_entry=list_entry)
        territories[idx] = territory

    if not quiet and skipped:
        print(f"Skipped {len(skipped)} geojson files:")
        for idx, reason in skipped[:10]:
            print(f"  {idx}: {reason}")

    return territories


def load_brwa_territory(profile_json: dict, geojson: dict, list_entry: dict) -> BRWATerritory:
    """
    Builds a full BRWATerritory from a detail profile + geometry.

    `list_entry` (from parse_brwa_list) is REQUIRED, not optional — it is
    the authoritative source for policy_tier and verification_maturity.
    This is intentionally not defaulted: silently falling back to
    'belum_ada' (the weakest tier) when a caller forgets to pass it would
    under-report a territory's actual legal status without any error,
    exactly the kind of silent failure this system is built to avoid.
    Pass list_entry=None explicitly (not omit it) if you genuinely have no
    list data for this territory — that at least makes the gap visible in
    code review rather than defaulting silently.
    """
    admin = profile_json.get("administratif") or {}
    kewilayahan = profile_json.get("kewilayahan") or {}
    kebijakan = profile_json.get("kebijakan_table") or []

    geom = None
    if geojson and geojson.get("features"):
        geom = shape(geojson["features"][0]["geometry"])

    policy_tier = list_entry["policy_tier"] if list_entry else "belum_ada"
    verification_maturity = list_entry["verification_maturity"] if list_entry else "early"

    # Name/admin fields prefer the profile (more precise, e.g. full title
    # with all sub-community names) but fall back to the list entry when
    # the profile is missing or minimal — confirmed necessary for the
    # geometry-only bulk-load path (load_brwa_directory), where a profile
    # JSON may not exist for every geojson we have.
    name = profile_json.get("title") or (list_entry["name"] if list_entry else None)
    province = admin.get("Propinsi") or (list_entry["province"] if list_entry else None)
    district = admin.get("Kabupaten") or (list_entry["district"] if list_entry else None)
    area_ha = _parse_area_ha(kewilayahan.get("Luas")) or (list_entry["area_ha"] if list_entry else None)

    return BRWATerritory(
        idx=profile_json.get("idx") or (list_entry["idx"] if list_entry else None),
        name=name,
        province=province,
        district=district,
        subdistrict=admin.get("Kecamatan"),
        area_ha=area_ha,
        geometry=geom,
        legal_documents=[{"description": k.get("description"), "pdf_url": k.get("pdf_url")} for k in kebijakan],
        policy_tier=policy_tier,
        verification_maturity=verification_maturity,
        source_url=profile_json.get("source_url"),
    )


def attach_brwa_evidence(candidate: UnifiedCandidateRecord, territories: list,
                          near_threshold_km: float = 10.0) -> UnifiedCandidateRecord:
    """
    Checks a candidate's point location against every loaded BRWA territory.
    Mutates and returns the candidate. Never creates a new candidate from
    BRWA data — evidence-attachment only, by design (see conversation notes).
    """
    if candidate.latitude is None or candidate.longitude is None:
        return candidate  # nothing to check spatially

    point = Point(candidate.longitude, candidate.latitude)  # shapely is (x=lon, y=lat)

    best = None  # (relationship, distance_km, territory)
    for t in territories:
        if t.geometry is None:
            continue

        if t.geometry.contains(point):
            best = ("inside", 0.0, t)
            break  # can't be more relevant than "inside" — stop looking

        # distance from point to polygon boundary, converted from degrees
        # to km using a flat-earth approximation (fine at this scale —
        # BRWA territories are not so large that curvature matters for a
        # 10km proximity check)
        deg_dist = point.distance(t.geometry)
        km_dist = deg_dist * 111.0
        if km_dist <= near_threshold_km and (best is None or km_dist < best[1]):
            best = ("near", km_dist, t)

    if best is None:
        candidate.brwa_overlap = None
        return candidate

    relationship, dist_km, territory = best
    candidate.brwa_overlap = {
        "brwa_idx": territory.idx,
        "territory_name": territory.name,
        "relationship": relationship,          # 'inside' | 'near'
        "distance_km": round(dist_km, 2),
        "policy_tier": territory.policy_tier,               # 'penetapan' | 'pengaturan' | 'belum_ada'
        "verification_maturity": territory.verification_maturity,  # 'early' | 'mid' | 'advanced'
        "legal_documents": territory.legal_documents,
        # Real, scraped BRWA profile page for this exact territory (e.g.
        # https://brwa.id/profil/3145) — was already captured on
        # BRWATerritory by load_brwa_territory() but never threaded into
        # the exported overlap dict, so the frontend had no real URL to
        # link the BRWA idx to. None when a territory was built without a
        # profile JSON (the geometry-only bulk-load path) — never guessed.
        "territory_source_url": territory.source_url,
    }

    # Only set the formal Pasal 6(1)(c) land-rights category when the
    # overlap is direct ('inside') AND BRWA's own list classifies this
    # territory as 'penetapan' — a specific government determination, not
    # just a general regional regulation ('pengaturan') or no policy at all.
    # This is the distinction the real data forced (see module docstring):
    # 'pengaturan' is real evidence of customary presence but does not meet
    # the bar Permenhut actually requires for the formal category.
    if relationship == "inside" and territory.policy_tier == "penetapan":
        candidate.land_rights_category = "hutan_adat"

    candidate.field_sources["brwa_overlap"] = {
        "source": "brwa",
        "source_tier": {"penetapan": 1, "pengaturan": 2, "belum_ada": 3}.get(territory.policy_tier, 3),
        "retrieved_at": None,
    }
    return candidate
