import json
import sys
sys.path.insert(0, "..")

from gluribridge.normalize_brwa import load_brwa_territory, attach_brwa_evidence, parse_brwa_list
from gluribridge.schema import UnifiedCandidateRecord
from shapely.geometry import Point

profile = json.load(open("sample_data/uploads/80.json", encoding="utf-8"))
geojson = json.load(open("sample_data/uploads/80.geojson", encoding="utf-8"))
wa_list = json.load(open("sample_data/uploads/wa_list.json", encoding="utf-8"))
lookup = parse_brwa_list(wa_list)

territory = load_brwa_territory(profile, geojson, list_entry=lookup.get("80"))
print("Loaded BRWA territory:")
print(f"  name: {territory.name[:60]}...")
print(f"  province/district: {territory.province} / {territory.district}")
print(f"  area_ha (parsed): {territory.area_ha}")
print(f"  recognition_level: {territory.policy_tier}")
print(f"  legal_documents: {len(territory.legal_documents)}")
for d in territory.legal_documents:
    print(f"    - {d['description'][:80]}...")
print()

# --- Test 1: a point genuinely INSIDE the polygon ---
interior_point = territory.geometry.representative_point()  # guaranteed inside
cand_inside = UnifiedCandidateRecord(name="Synthetic candidate INSIDE Cibedug")
cand_inside.latitude = interior_point.y
cand_inside.longitude = interior_point.x
attach_brwa_evidence(cand_inside, [territory])
print("TEST 1 — candidate placed inside the real polygon:")
print(f"  brwa_overlap: {cand_inside.brwa_overlap}")
print(f"  land_rights_category: {cand_inside.land_rights_category}")
print()

# --- Test 2: a point genuinely far away (Katingan, Central Kalimantan) ---
cand_far = UnifiedCandidateRecord(name="Katingan (unrelated, different island)")
cand_far.latitude, cand_far.longitude = -2.382579, 113.267275
attach_brwa_evidence(cand_far, [territory])
print("TEST 2 — Katingan (genuinely unrelated location):")
print(f"  brwa_overlap: {cand_far.brwa_overlap}  (expect None)")
print()

# --- Test 3: a point near the boundary but outside (~a few km away) ---
bounds = territory.geometry.bounds  # (minx, miny, maxx, maxy)
minx, miny, maxx, maxy = bounds
near_point = Point(maxx + 0.03, (miny + maxy) / 2)  # ~a few km east of the bounding box
cand_near = UnifiedCandidateRecord(name="Synthetic candidate NEAR Cibedug boundary")
cand_near.latitude = near_point.y
cand_near.longitude = near_point.x
attach_brwa_evidence(cand_near, [territory])
print("TEST 3 — candidate just outside the boundary (~a few km away):")
print(f"  brwa_overlap: {cand_near.brwa_overlap}")
print(f"  land_rights_category: {cand_near.land_rights_category}  (expect None — 'near' isn't strong enough alone)")
