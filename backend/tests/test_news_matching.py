import json
import sys
sys.path.insert(0, "..")

from gluribridge.normalize_sruk import normalize_sruk_record
from gluribridge.news_matching import build_queries, process_hit, apply_corroboration, new_thin_candidate_from_hit

# Real existing candidate to test corroboration against
katingan = normalize_sruk_record(json.load(open("sample_data/sruk/REG-11-PR-VII-2026-7235.json", encoding="utf-8")))
existing_candidates = [katingan]

print("=== Query template generation ===")
queries = build_queries(provinces=["Kalimantan Tengah"])
for q in queries[:4]:
    print(f"  {q}")
print(f"  ... ({len(queries)} total)")
print()

# --- Mock hit 1: should CORROBORATE the existing Katingan candidate ---
hit_corroborate = {
    "title": "PT Rimba Makmur Utama Reports Progress on Katingan Peatland Restoration",
    "url": "https://example-news.id/rmu-katingan-update",
    "content": (
        "PT Rimba Makmur Utama announced continued progress on its peatland "
        "restoration project in Central Kalimantan, reaffirming its commitment "
        "to community-based conservation in the Katingan region."
    ),
    "score": 0.82,
}

# --- Mock hit 2: a genuinely NEW organization, not in our candidate list ---
hit_new = {
    "title": "Yayasan Hutan Lestari Nusantara Launches Mangrove Carbon Pilot in Aceh",
    "url": "https://example-news.id/yhln-aceh-mangrove",
    "content": (
        "Yayasan Hutan Lestari Nusantara has begun a community mangrove "
        "restoration pilot in Aceh, seeking technology partners for carbon "
        "measurement and monitoring."
    ),
    "score": 0.71,
}

# --- Mock hit 3: irrelevant, no extractable org identity ---
hit_irrelevant = {
    "title": "Palm Oil Prices Rise on Export Demand",
    "url": "https://example-news.id/palm-oil-prices",
    "content": "Indonesian palm oil futures rose 2% this week amid strong export demand from India and China.",
    "score": 0.44,
}

print("=== Processing 3 mock hits ===")
for label, hit in [("CORROBORATE case", hit_corroborate), ("NEW lead case", hit_new), ("IRRELEVANT case", hit_irrelevant)]:
    action = process_hit(hit, query="test query", existing_candidates=existing_candidates)
    print(f"\n{label}:")
    print(f"  action: {action['action']}")
    print(f"  org_candidates extracted: {action['org_candidates']}")
    print(f"  match_score: {action['match_score']:.1f}")
    if action.get("reason"):
        print(f"  reason: {action['reason']}")

    if action["action"] == "corroborate":
        apply_corroboration(action["target_candidate"], action, query="test query")
        print(f"  -> attached to: {action['target_candidate'].name}")
        print(f"  -> candidate.news_evidence: {action['target_candidate'].news_evidence}")
    elif action["action"] == "new_thin_candidate":
        new_cand = new_thin_candidate_from_hit(action, query="test query")
        print(f"  -> created thin candidate: name={new_cand.name!r}  org={new_cand.org!r}  "
              f"data_richness={new_cand.data_richness}  verification_status={new_cand.verification_status}")
