import json
import sys
sys.path.insert(0, "..")

from gluribridge.normalize_sruk import normalize_sruk_record
from gluribridge.normalize_verra import normalize_verra_record
from gluribridge.match import resolve_candidates

records = []

# The two real Katingan SRUK/SRN-PPI records
with open("sample_data/sruk/REG-11-PR-VII-2026-7235.json", encoding="utf-8") as f:
    raw = json.load(f)
    rec = normalize_sruk_record(raw)
    print(f"Normalized SRUK-side: source={rec.primary_source}, registry_no={rec.registry_ids}, "
          f"lat/lon=({rec.latitude},{rec.longitude}), docs={len(rec.documents)}")
    records.append(rec)

with open("sample_data/sruk/REG-11-PR-X-2025-6737.json", encoding="utf-8") as f:
    raw = json.load(f)
    rec = normalize_sruk_record(raw)
    print(f"Normalized SRN-PPI-side: source={rec.primary_source}, registry_no={rec.registry_ids}, "
          f"lat/lon=({rec.latitude},{rec.longitude}) [placeholder correctly dropped], "
          f"province={rec.province}, docs={len(rec.documents)}")
    records.append(rec)

# The real Verra 1477 (Katingan) scraper output
with open("sample_data/uploads/1477.json", encoding="utf-8") as f:
    raw = json.load(f)
    rec = normalize_verra_record(raw)
    print(f"Normalized Verra: source={rec.primary_source}, project_id={rec.registry_ids['verra_project_id']}, "
          f"lat/lon=({rec.latitude},{rec.longitude}), province={rec.province}, docs={len(rec.documents)}, "
          f"units={rec.verra_units}")
    records.append(rec)

print("\n" + "="*70)
print("RUNNING IDENTITY RESOLUTION")
print("="*70)

final_candidates, tentative = resolve_candidates(records)

print(f"\nInput records: {len(records)}  ->  Final candidates: {len(final_candidates)}  "
      f"(expect 1 if all three correctly merge)\n")

for c in final_candidates:
    print("-" * 70)
    print(f"CANDIDATE: {c.name}")
    print(f"  org: {c.org}")
    print(f"  province/district: {c.province} / {c.district}")
    print(f"  lat/lon: {c.latitude}, {c.longitude}")
    print(f"  registry_ids: {c.registry_ids}")
    print(f"  registration_stage: {c.registration_stage}  momentum: {c.registration_momentum}")
    print(f"  dram: {'present' if c.dram else None}   dpp: {'present' if c.dpp else None}")
    print(f"  verra_status: {c.verra_status}   verra_units: {c.verra_units}")
    print(f"  registrant_contact: {c.registrant_contact}")
    print(f"  total documents (unioned): {len(c.documents)}  by source: {c.documents_by_source_count}")
    print(f"  data_richness: {c.data_richness}   verification_status: {c.verification_status}")
    print(f"  merge history:")
    for m in c.merged_from:
        print(f"    - {m}")

print(f"\nTentative (unmerged, needs-review) links: {len(tentative)}")
for t in tentative:
    print(f"  {t}")
