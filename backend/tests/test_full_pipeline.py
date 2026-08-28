import sys, glob, json
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline

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

# same 3 mock hits used in test_news_matching.py — injected via news_hits_override
# so this runs end-to-end without needing live Tavily network access
mock_hits = {
    "test query": [
        {
            "title": "PT Rimba Makmur Utama Reports Progress on Katingan Peatland Restoration",
            "url": "https://example-news.id/rmu-katingan-update",
            "content": ("PT Rimba Makmur Utama announced continued progress on its peatland "
                        "restoration project in Central Kalimantan."),
        },
        {
            "title": "Yayasan Hutan Lestari Nusantara Launches Mangrove Carbon Pilot in Aceh",
            "url": "https://example-news.id/yhln-aceh-mangrove",
            "content": ("Yayasan Hutan Lestari Nusantara has begun a community mangrove "
                        "restoration pilot in Aceh, seeking technology partners for carbon "
                        "measurement and monitoring."),
        },
        {
            "title": "Palm Oil Prices Rise on Export Demand",
            "url": "https://example-news.id/palm-oil-prices",
            "content": "Indonesian palm oil futures rose 2% this week amid strong export demand.",
        },
    ]
}

result = run_pipeline(
    sruk_files=sruk_files, verra_files=verra_files,
    brwa_list_path="sample_data/uploads/wa_list.json",
    brwa_geojson_dir="sample_data/brwa_bulk/geojson",
    brwa_profile_dir="sample_data/brwa_bulk/profiles",
    news_hits_override=mock_hits,
    run_scoring=True,
)

print("=== STATS ===")
for k, v in result.stats.items():
    print(f"  {k}: {v}")

print()
print("=== NEWS ACTIONS ===")
for a in result.news_actions:
    print(f"  action={a['action']:18s} target={str(a['target'])[:40]:40s} score={a['match_score']}")

print()
print("=== RANKED (need_score desc) — same shape as the dashboard mockup ===")
ranked = sorted(result.scores.items(), key=lambda kv: -kv[1]["need_score"])
for cid, score in ranked:
    cand = next(c for c in result.candidates if c.candidate_id == cid)
    print(f"  need={score['need_score']:<6} cred={score['credibility_score']:<6} "
          f"richness={cand.data_richness:<8} {cand.name[:55]}")

print()
print("=== Confirming: does Katingan still show real news_evidence attached? ===")
katingan = next(c for c in result.candidates if "Katingan Peatland" in c.name)
print(json.dumps(katingan.news_evidence, indent=2))
