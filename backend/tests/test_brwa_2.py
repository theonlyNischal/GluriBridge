import json
import sys
sys.path.insert(0, "..")

from gluribridge.normalize_brwa import (
    parse_brwa_list, prefilter_by_admin, load_brwa_territory, attach_brwa_evidence
)
from gluribridge.schema import UnifiedCandidateRecord

wa_list = json.load(open("sample_data/uploads/wa_list.json", encoding="utf-8"))
lookup = parse_brwa_list(wa_list)
print(f"Parsed BRWA list: {len(lookup)} territories\n")

print("=== List entry cross-check ===")
print("idx=80:", lookup.get("80"))
print("idx=87:", lookup.get("87"))
print()

print("=== Loading both real profiles WITH list-derived tier ===")
profile80 = json.load(open("sample_data/uploads/80.json", encoding="utf-8"))
geojson80 = json.load(open("sample_data/uploads/80.geojson", encoding="utf-8"))
t80 = load_brwa_territory(profile80, geojson80, list_entry=lookup.get("80"))
print(f"Territory 80 (Cibedug): policy_tier={t80.policy_tier}  verification_maturity={t80.verification_maturity}")

profile87 = json.load(open("sample_data/uploads/87.json", encoding="utf-8"))
geojson87 = json.load(open("sample_data/uploads/87.geojson", encoding="utf-8"))
t87 = load_brwa_territory(profile87, geojson87, list_entry=lookup.get("87"))
print(f"Territory 87 (Cek Bocek Selesek Rensuri): policy_tier={t87.policy_tier}  verification_maturity={t87.verification_maturity}")
print("  (expect 'pengaturan', NOT 'penetapan' — only a provincial Perda, no specific decree)")
print()

print("=== Land-rights category test: candidate INSIDE each territory ===")
for t in (t80, t87):
    pt = t.geometry.representative_point()
    cand = UnifiedCandidateRecord(name=f"Synthetic candidate inside {t.name[:30]}")
    cand.latitude, cand.longitude = pt.y, pt.x
    attach_brwa_evidence(cand, [t])
    print(f"  Inside {t.name[:40]}: policy_tier={t.policy_tier} -> land_rights_category={cand.land_rights_category}")
print()

print("=== Pre-filter test: coarse province/district filter before geometry ===")
hits_banten = prefilter_by_admin("Banten", "Lebak", lookup)
print(f"Territories in Banten/Lebak (should include idx=80): {len(hits_banten)}")
print(f"  idx=80 present: {'80' in [h['idx'] for h in hits_banten]}")

hits_ntb = prefilter_by_admin("Nusa Tenggara Barat", "Sumbawa", lookup)
print(f"Territories in Nusa Tenggara Barat/Sumbawa (should include idx=87): {len(hits_ntb)}")
print(f"  idx=87 present: {'87' in [h['idx'] for h in hits_ntb]}")

hits_unrelated = prefilter_by_admin("Central Kalimantan", None, lookup)
print(f"Territories matching 'Central Kalimantan' (SRUK-style province name, won't match BRWA's own naming): {len(hits_unrelated)}")

print()
print("=== Full tier distribution sanity check ===")
from collections import Counter
tiers = Counter(t["policy_tier"] for t in lookup.values())
maturity = Counter(t["verification_maturity"] for t in lookup.values())
print("policy_tier:", dict(tiers))
print("verification_maturity:", dict(maturity))
