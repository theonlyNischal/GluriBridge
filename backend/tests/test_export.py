import sys, glob
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline
from gluribridge.export import export_pipeline_result

sruk_files = glob.glob("sample_data/sruk/*.json") + [
    "sample_data/uploads/REG-11-PR-I-2026-1353.json",
    "sample_data/uploads/REG-11-PR-I-2026-1702.json",
    "sample_data/uploads/REG-10-PR-III-2025-16202.json",
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
    sruk_files=sruk_files, verra_files=verra_files,
    brwa_list_path="sample_data/uploads/wa_list.json",
    brwa_geojson_dir="sample_data/brwa_bulk/geojson",
    brwa_profile_dir="sample_data/brwa_bulk/profiles",
)

summary = export_pipeline_result(result, output_dir="exported_output")
print(summary)
