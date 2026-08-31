"""
activity_type.py — real cases from this project's own 2026-08-31
classification test (PROJECT_CONTEXT.md Section 6), not synthetic
strings. Run from backend/tests/:
    python3 test_activity_type.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gluribridge.schema import UnifiedCandidateRecord
from gluribridge.activity_type import classify_activity_type


def make(name, org=None, primary_source="sruk", verra_afolu_activities=None):
    return UnifiedCandidateRecord(name=name, org=org, primary_source=primary_source,
                                   verra_afolu_activities=verra_afolu_activities)


print("--- Case 1: Peatland, single (real SRUK title) ---")
r = classify_activity_type(make("Perlindungan dan Pengelolaan Lokasi Gambut, Kabupaten Kutai Kartanegara", "PT. Tirta Carbon Indonesia"))
print(r)
print("Expect categories=['Peatland', 'Conservation'] (gambut + perlindungan), not_applicable=False\n")

print("--- Case 2: Reforestation via widened 'tutupan hutan' keyword (the real rescue) ---")
r = classify_activity_type(make("Peningkatan tutupan hutan pada lanskap hulu SubDAS Karang Mumus, Kota Samarinda"))
print(r)
print("Expect categories=['Reforestation'], not_applicable=False\n")

print("--- Case 3: Conservation via widened fire-patrol signal (the real rescue) ---")
r = classify_activity_type(make(
    "Pengurangan laju deforestasi akibat kebakaran hutan melalui patroli intensif oleh Unit Kegiatan Mahasiswa Peduli Api"))
print(r)
print("Expect categories=['Conservation'], not_applicable=False\n")

print("--- Case 4: Social forestry via NAME keyword (real title) ---")
r = classify_activity_type(make(
    "Pengelolaan Lingkungan Hijau melalui Perdagangan karbon pada wilayah Perhutanan Sosial di Provinsi Sulawesi tengah",
    "Momua Journey"))
print(r)
print("Expect categories=['Social forestry'], not_applicable=False\n")

print("--- Case 5: Social forestry via ORG-name signal only, title carries no category keyword ---")
r = classify_activity_type(make("Hutani Berkah Mulia", "KTH Hutani Berkah Mulia"))
print(r)
print("Expect categories=['Social forestry'] (KTH org prefix), not_applicable=False\n")

print("--- Case 6: Multi-tag, all 3 (real title, literally all 3 keywords present) ---")
r = classify_activity_type(make("PLUM Peat and Mangrove Conservation and Restoration Project (PLUM Project)", "PT. Pagatan Usaha Makmur (PP)", primary_source="verra", verra_afolu_activities="ARR,REDD,WRC"))
print(r)
print("Expect categories=['Peatland', 'Reforestation', 'Conservation'] (order per classify_activity_type's own check order), not_applicable=False\n")

print("--- Case 7: Improved Forest Management via the REAL afolu_activities field (Verra) ---")
r = classify_activity_type(make("JATI DHARMA INDAH PLYWOOD INDUSTRIES IFM PROJECT 1", "Multiple Project Proponents", primary_source="verra", verra_afolu_activities="IFM"))
print(r)
print("Expect categories=['Improved Forest Management'], not_applicable=False\n")

print("--- Case 8: Not applicable, the REAL AgriCapture case (confirmed via real afolu_activities='ALM') ---")
r = classify_activity_type(make("AgriCapture Southeast Asia Rice Methane Project", "AgriCapture, Inc. (PP)", primary_source="verra", verra_afolu_activities="ALM"))
print(r)
print("Expect categories=[], not_applicable=True, reason mentions 'ALM'\n")

print("--- Case 9: Unclassified — bare place name, genuinely no signal (real title) ---")
r = classify_activity_type(make("Papua Merauke", "PT Alam Sejahtera Nusantara "))
print(r)
print("Expect categories=[], not_applicable=False (this is UNCLASSIFIED, not not_applicable — a real SRUK/domestic candidate is never not_applicable)\n")

print("--- Case 10: A SRUK candidate can never be not_applicable, even with zero category matches ---")
r = classify_activity_type(make("Pengurangan Emisi GRK", "PT Duo Kembar", primary_source="sruk"))
print(r)
print("Expect categories=[], not_applicable=False -- SRUK/SRN-PPI has no afolu_activities field, so not_applicable must never fire\n")

print("--- Case 11: A Verra candidate with a forest-related code alongside ALM must NOT be not_applicable ---")
r = classify_activity_type(make("Some ALM+ARR combined project", "Some Org", primary_source="verra", verra_afolu_activities="ALM,ARR"))
print(r)
print("Expect not_applicable=False (ARR is forest-related, present alongside ALM)\n")

print("--- Case 12: Verra candidate with genuinely no afolu_activities field on file at all ---")
r = classify_activity_type(make("Some Verra Project With No Code", "Some Org", primary_source="verra", verra_afolu_activities=None))
print(r)
print("Expect not_applicable=False -- absence of the field is not evidence of a non-forest activity, never guessed\n")
