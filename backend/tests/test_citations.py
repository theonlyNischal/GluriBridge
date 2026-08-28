import os, sys, glob, json
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline
from gluribridge.news_matching import new_thin_candidate_from_hit
from gluribridge.export import detail_view

# __file__-relative, not a hardcoded absolute path — this test lives in
# backend/tests/, real data lives in backend/data/raw/, one level up.
DATA_RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
sruk_srn = sorted(glob.glob(f"{DATA_RAW}/sruk/raw_details/*.json")) + sorted(glob.glob(f"{DATA_RAW}/srn_ppi/raw_details/*.json"))
run_dirs = sorted(glob.glob(f"{DATA_RAW}/verra/runs/*"))
verra_files = sorted(glob.glob(f"{run_dirs[-1]}/projects/*.json"))

result = run_pipeline(
    sruk_files=sruk_srn, verra_files=verra_files,
    brwa_list_path=f"{DATA_RAW}/brwa_profiles/wa_list.json",
    brwa_geojson_dir=f"{DATA_RAW}/brwa_geojson/geojson",
    brwa_profile_dir=f"{DATA_RAW}/brwa_profiles/profiles",
)

# --- Case 1: Katingan — multi-source, many real documents. Citations for
# DIFFERENT reasons must point to DIFFERENT, genuinely correct documents,
# not the same generic SRUK link reused everywhere. ---
katingan = next(c for c in result.candidates if "Katingan Peatland" in c.name)
dv = detail_view(katingan)
dram_cit = next(r["citation"] for r in dv["scoring"]["credibility_components"]["registry_status"]["reasons"]
                 if r["text"].startswith("Has a DRAM or DPP"))
land_cit = next(r["citation"] for r in dv["scoring"]["credibility_components"]["land_rights"]["reasons"]
                 if r["text"].startswith("Formal land-rights"))
assert dram_cit["url"] and dram_cit["url"].endswith(".pdf"), "DRAM citation must be a real document URL"
assert "Dokumen DRAM" in dram_cit["source_type"], "DRAM citation must name the specific real document"
assert land_cit["url"] and "brwa.id" in land_cit["url"], "land-rights citation must be the real BRWA decree URL"
assert dram_cit["url"] != land_cit["url"], "two different claims must cite two different real documents"
print("CASE 1 (Katingan) — DRAM citation:", dram_cit["url"])
print("CASE 1 (Katingan) — land-rights citation:", land_cit["url"])
print(">>> VERIFIED: two different real claims cite two different, genuinely specific real documents.\n")

# --- Case 2: a real BRWA hutan_adat case — land-rights citation must be
# the actual decree PDF, not a generic "BRWA" label. (Katingan already IS
# one such case — reuse it, and additionally confirm the citation's
# source_type names the actual decree, not just "BRWA".) ---
assert land_cit["source_type"] != "BRWA", "must name the actual decree, not a generic label"
assert "SK Bupati" in land_cit["source_type"] or "SK." in land_cit["source_type"], \
    "source_type should name the real decree document"
print("CASE 2 (BRWA hutan_adat) — source_type:", land_cit["source_type"])
print(">>> VERIFIED: real decree document named specifically, not a generic BRWA label.\n")

# --- Case 3: a claim with no single backing document (verra_status-based
# N3 reason) — must cite honestly, never fabricate a link. ---
verra_status_candidate = next(
    (c for c in result.candidates for r in dv["scoring"]["need_detection_reasons"] if False), None
)
n3_case = None
for c in result.candidates:
    d = detail_view(c)
    n3 = next((r for r in d["scoring"]["need_detection_reasons"] if r["rule"] == "N3"), None)
    if n3:
        n3_case = (c, d, n3)
        break
assert n3_case, "expected at least one real N3 (Verra early-stage status) case in the real data"
c, d, n3 = n3_case
assert n3["citation"]["url"] is None, "N3 has no single backing document — url must be None, not fabricated"
assert n3["citation"]["note"], "N3's citation must explain why there's no document, not omit it silently"
print(f"CASE 3 (no single document, {c.name[:50]!r}) — citation:", n3["citation"])
print(">>> VERIFIED: no fabricated link; honest note explains the absence.\n")

# --- Case 4: a thin/news candidate — its one hypothesis-tagged reason
# must cite the ACTUAL real news URL, not a placeholder. ---
thin_hit_action = {
    "org_candidates": ["Yayasan Hutan Lestari Nusantara"],
    "match_score": 43.5,
    "hit": {"title": "Yayasan Hutan Lestari Nusantara Launches Mangrove Carbon Pilot in Aceh",
            "url": "https://example-news.id/yhln-aceh-mangrove"},
}
thin = new_thin_candidate_from_hit(thin_hit_action, query="mangrove carbon Aceh")
thin_dv = detail_view(thin)
thin_reason = thin_dv["dossier"]["structured"]["why_gluri"][0]
assert thin_reason["citation"]["url"] == "https://example-news.id/yhln-aceh-mangrove", \
    "thin candidate's citation must be the real originating news URL, not a placeholder"
print("CASE 4 (thin/news candidate) — citation:", thin_reason["citation"])
print(">>> VERIFIED: real news URL cited, not a placeholder.\n")

# --- Full-128 sweep: no candidate ends up with a missing/broken citation
# field anywhere (need_detection_reasons or credibility_components). ---
missing = []
for c in result.candidates:
    d = detail_view(c)
    for r in d["scoring"]["need_detection_reasons"]:
        if "citation" not in r or r["citation"] is None:
            missing.append((c.name, "need", r.get("rule")))
        elif set(r["citation"].keys()) != {"source_type", "url", "retrieved_at", "note"}:
            missing.append((c.name, "need-shape", r.get("rule")))
    for comp_key, comp in d["scoring"]["credibility_components"].items():
        for r in comp["reasons"]:
            if "citation" not in r or r["citation"] is None:
                missing.append((c.name, comp_key, r.get("text")))
            elif set(r["citation"].keys()) != {"source_type", "url", "retrieved_at", "note"}:
                missing.append((c.name, f"{comp_key}-shape", r.get("text")))
    lrc = d["dossier"]["structured"]["land_and_regulatory"].get("land_rights_citation")
    if lrc is None:
        missing.append((c.name, "land_rights_citation", None))

print(f"=== FULL-{len(result.candidates)} SWEEP: candidates with missing/malformed citation field: {len(missing)} ===")
for m in missing[:20]:
    print("  ", m)
assert not missing, f"{len(missing)} missing/malformed citations found"
print(">>> VERIFIED: every candidate's every reason (need + credibility) and land_rights_citation has a well-formed citation field.")
