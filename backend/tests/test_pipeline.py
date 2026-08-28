import sys, glob
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline

sruk_files = glob.glob("sample_data/sruk/*.json") + [
    "sample_data/uploads/REG-11-PR-I-2026-1353.json",
    "sample_data/uploads/REG-11-PR-I-2026-1702.json",
    "sample_data/uploads/REG-10-PR-III-2025-16202.json",  # non-forestry — must be filtered out
]

# Includes 3 deliberately non-Indonesian real Verra samples, on purpose:
# 832 (Cikel Brazilian Amazon REDD+, Brazil), 1248 (CGN Hami solar, China),
# 4145 (Black Soldier Fly farming, Tanzania) — added during development
# specifically to prove normalize_verra_record's schema handling
# generalizes across countries, not just Indonesia. Do NOT remove these if
# you notice non-Indonesian output: 1248/4145 are non-forestry sector, so
# filter_to_forestry already excludes them; 832 IS forestry-sector and is
# correctly excluded by run_pipeline()'s country filter
# (filter_to_indonesia=True, added after real Verra data showed 97.6% of
# candidates were non-Indonesian) — that's the fix working as intended.
verra_ids = ["487", "832", "1248", "1477", "4145", "3226", "4186", "5631", "5283", "5524", "674", "5736", "4292"]
verra_files = [f"sample_data/uploads/{i}.json" for i in verra_ids]

result = run_pipeline(
    sruk_files=sruk_files,
    verra_files=verra_files,
    brwa_list_path="sample_data/uploads/wa_list.json",
    brwa_geojson_dir="sample_data/brwa_bulk/geojson",
    brwa_profile_dir="sample_data/brwa_bulk/profiles",
)

print("=" * 70)
print("PIPELINE STATS")
print("=" * 70)
for k, v in result.stats.items():
    print(f"  {k}: {v}")

print()
print("SKIPPED (non-forestry):")
for path, sector in result.skipped_non_forestry:
    print(f"  {path.split('/')[-1]}: sector={sector}")

print()
print("ERRORS:")
for path, err in result.errors:
    print(f"  {path}: {err}")

print()
print("=" * 70)
print(f"FINAL CANDIDATES ({len(result.candidates)})")
print("=" * 70)
for c in result.candidates:
    sources = [m["source"] for m in c.merged_from]
    brwa_note = f" | BRWA: {c.brwa_overlap['relationship']} {c.brwa_overlap['policy_tier']}" if c.brwa_overlap else ""
    print(f"  - {c.name[:55]:55s} | sources={sources} | rights={c.land_rights_category}{brwa_note}")

print()
print("TENTATIVE LINKS (need human review):")
for t in result.tentative_links:
    print(f"  {t['candidate_a'][:35]} <-> {t['candidate_b'][:35]}  score={t['score']}")

print()
print("BRWA COVERAGE GAPS (nearby territories we have no geometry for yet):")
for name, missing in result.brwa_coverage_gaps.items():
    print(f"  {name[:40]}: {len(missing)} nearby territories not yet fetched")
