import json
import sys
sys.path.insert(0, "..")

from gluribridge.normalize_sruk import normalize_sruk_record
from gluribridge.normalize_verra import normalize_verra_record
from gluribridge.match import resolve_candidates, match_score, classify_match

def load_sruk(path):
    return normalize_sruk_record(json.load(open(path, encoding="utf-8")))

def load_verra(project_id):
    return normalize_verra_record(json.load(open(f"sample_data/uploads/{project_id}.json", encoding="utf-8")))

print("="*78)
print("CLUSTER 1: SERAM COLLISION — 3 different SRUK companies + 2 Verra records")
print("="*78)

west_seram   = load_sruk("sample_data/sruk/REG-11-PR-VIII-2026-3117.json")   # Asia Pasifik
sercova_sruk = load_sruk("sample_data/sruk/REG-11-PR-VII-2026-3625.json")    # Strata Pacific
central_seram= load_sruk("sample_data/sruk/REG-11-PR-VII-2026-9851.json")    # Bintang Lima Makmur
verra_5283   = load_verra("5283")   # SERCOVA / Strata Pacific — sign-flipped lat
verra_5524   = load_verra("5524")   # Central Seram / "Multiple Project Proponents"

seram_records = [west_seram, sercova_sruk, central_seram, verra_5283, verra_5524]
final, tentative = resolve_candidates(seram_records)

print(f"\nInput: 5 records -> Final candidates: {len(final)} (expect 3: West / SERCOVA-merged / Central-merged)\n")
for c in final:
    sources = [m["source"] for m in c.merged_from]
    print(f"  - '{c.name[:60]}...' | org={c.org} | merged_from sources={sources}")

print(f"\nTentative links: {len(tentative)}")
for t in tentative:
    print(f"  {t['candidate_a'][:40]} <-> {t['candidate_b'][:40]}  score={t['score']}")

print("\n--- Explicit pair checks ---")
score, bd = match_score(sercova_sruk, verra_5283)
print(f"SRUK Strata Pacific vs Verra 5283 (sign-flipped coord): {score} -> {classify_match(score)}")
print(f"  geo_distance_km={bd['geo_distance_km']}  geo_suspect={bd['geo_suspect_data_flagged']}  org={bd['org_score']} desc={bd['desc_score']}")

score, bd = match_score(central_seram, verra_5524)
print(f"\nSRUK Bintang Lima Makmur vs Verra 5524 ('Multiple Project Proponents'): {score} -> {classify_match(score)}")
print(f"  org_score={bd['org_score']}  name_score={bd['name_score']}  desc_score={bd['desc_score']}")

score, bd = match_score(west_seram, verra_5283)
print(f"\nSRUK West Seram vs Verra 5283 (should NOT match): {score} -> {classify_match(score)}")
print(f"  {bd}")

score, bd = match_score(west_seram, verra_5524)
print(f"\nSRUK West Seram vs Verra 5524 (should NOT match): {score} -> {classify_match(score)}")
print(f"  {bd}")

print("\n" + "="*78)
print("CLUSTER 2: CENTRAL KALIMANTAN PROXIMITY — 4 distinct real Verra projects")
print("="*78)

katingan = load_verra("1477")
rimba_raya = load_verra("674")
kapuas_pisau = load_verra("5736")
kahayan = load_verra("4292")

kalimantan_records = [katingan, rimba_raya, kapuas_pisau, kahayan]
final2, tentative2 = resolve_candidates(kalimantan_records)

print(f"\nInput: 4 records -> Final candidates: {len(final2)} (expect 4 — all genuinely different projects)\n")
for c in final2:
    print(f"  - {c.name}  (org={c.org})")
print(f"\nTentative links: {len(tentative2)}  (expect 0 or low-score only)")
for t in tentative2:
    print(f"  {t}")
