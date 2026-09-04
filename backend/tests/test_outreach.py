import sys, glob
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline
from gluribridge.dossier import build_dossier
from gluribridge.news_matching import new_thin_candidate_from_hit
from gluribridge.scoring import score_candidate
from gluribridge.outreach import generate_outreach, render_outreach_text
from gluribridge.schema import RegistrantContact

# Same sample_data fixture set test_dossier.py uses — see that file's own
# comment for why the deliberately-non-Indonesian Verra samples are there.
sruk_files = glob.glob("sample_data/sruk/*.json") + [
    "sample_data/uploads/REG-11-PR-I-2026-1353.json",
    "sample_data/uploads/REG-11-PR-I-2026-1702.json",
    "sample_data/uploads/REG-10-PR-III-2025-16202.json",
]
verra_ids = ["487", "832", "1248", "1477", "4145", "3226", "4186", "5631", "5283", "5524", "674", "5736", "4292"]
verra_files = [f"sample_data/uploads/{i}.json" for i in verra_ids]

result = run_pipeline(sruk_files=sruk_files, verra_files=verra_files,
    brwa_list_path="sample_data/uploads/wa_list.json",
    brwa_geojson_dir="sample_data/brwa_bulk/geojson",
    brwa_profile_dir="sample_data/brwa_bulk/profiles")

# --- Case 1: real Tier A contact (name, no email) ---
west_seram = next(c for c in result.candidates if "West Seram" in c.name)
assert west_seram.registrant_contact.name and not west_seram.registrant_contact.email, \
    "expected a real Tier A shape: name present, email absent"

# --- Case 2: real Tier B contact (email, no name) ---
# InfiniteEARTH/Rimba Raya has no contact in this sample_data snapshot, so
# reattach the ACTUAL real Tier B resolution confirmed today's live export
# (2026-08-27 exported_output_stage3/candidate_details.json) rather than
# re-spending a live Tavily call or fabricating page content to mock —
# these are the real, previously-verified field values, not invented ones.
rimba_raya = next(c for c in result.candidates if "Rimba Raya" in c.name)
rimba_raya.registrant_contact = RegistrantContact(
    name=None, org="InfiniteEARTH", email="infiniteearthpulsar@gmail.com",
    contact_source="org_website", contact_source_url="https://theinfiniteearth.com",
    contact_confidence="high",
)

# --- Case 3: no usable contact at all (most thin candidates) ---
thin_hit_action = {
    "org_candidates": ["Yayasan Hutan Lestari Nusantara"],
    "match_score": 43.5,
    "hit": {"title": "Yayasan Hutan Lestari Nusantara Launches Mangrove Carbon Pilot in Aceh",
            "url": "https://example-news.id/yhln-aceh-mangrove"},
}
thin_candidate = new_thin_candidate_from_hit(thin_hit_action, query="mangrove carbon Aceh")
assert thin_candidate.registrant_contact is None or not thin_candidate.registrant_contact.contact_source

# --- Case 4: Katingan specifically ---
katingan = next(c for c in result.candidates if "Katingan Peatland" in c.name)

# --- Case 5: a candidate with BOTH real fact-tagged reasons (N1/N2/N5)
# AND a real hypothesis-tagged one (N4), to prove the one-sentence
# context selection (2026-09-04 rewrite, see outreach.py) picks N4 (top
# CONTEXT_PRIORITY) and hedges it correctly, rather than either ignoring
# it or blending it with the fact-tagged reasons. Central Seram doesn't
# naturally trip N4, so attach a real-shaped news hit that does.
central_seram = next(c for c in result.candidates if "Central Seram IFM Restorationwise" in c.name)
central_seram.news_evidence = [{
    "title": "PT. Bintang Lima Makmur tengah mencari mitra teknologi pemantauan karbon",
    "url": "https://example-news.id/blm-mitra-teknologi",
    "query": "mitra teknologi pemantauan Maluku",
    "match_score": 92.0,
    "evidence_level": "hypothesis",
    "source_tier": 4,
}]

cases = [
    ("CASE 1 — Tier A (real name, no email): West Seram / Tuhfah Fathiyyah Muhjah", west_seram),
    ("CASE 2 — Tier B (real email, no name): Rimba Raya / InfiniteEARTH", rimba_raya),
    ("CASE 3 — no usable contact: thin news-derived candidate", thin_candidate),
    ("CASE 4 — Katingan (mature, near-zero need)", katingan),
    ("CASE 5 — hypothesis-tagged context sentence (N4) takes priority over fact-tagged N1/N2/N5", central_seram),
]

for label, cand in cases:
    print("=" * 90)
    print(label)
    print("=" * 90)
    score = score_candidate(cand)
    dossier = build_dossier(cand, score)
    outreach = generate_outreach(cand, dossier)
    print(f"need_score={score['need_score']}  credibility_score={score['credibility_score']}")
    print(f"recipient_status: {outreach['recipient_status']}")
    print(f"warnings: {outreach['warnings']}")
    print()
    text = render_outreach_text(outreach)
    print(text)

    if outreach["recipient_status"] != "insufficient_contact":
        assert "-----\nVersi Bahasa Indonesia" in text, "bilingual divider must be present"
        assert outreach["body_en"] in text and outreach["body_id"] in text, \
            "both language bodies must be present in the combined rendering"

    if label.startswith("CASE 5"):
        # 2026-09-04 rewrite: the opening paragraph is now ONE recipient-
        # facing context sentence (see outreach.py's module docstring),
        # not a list of every why_gluri reason — so this case (N1/N2/N5
        # fact + an injected N4 hypothesis) now surfaces only N4, the
        # top-priority rule that actually fired, hedged in both
        # languages. The N1/N2/N5 fact text is real and still computed
        # (build_dossier() didn't change), just no longer the one chosen
        # to appear in THIS email — Case 6 below proves the fact/plain
        # path with a candidate where N4 never fires.
        assert "Based on what we've found so far, it appears that a public mention suggests" in outreach["body_en"], \
            "EN: hypothesis-tagged context sentence (N4) must be hedged, not stated as fact"
        assert "Reached technical/validation stage" not in outreach["body_en"], \
            "EN: only ONE context sentence should appear now, not every why_gluri reason"
        # Indonesian hedge, pinned down the same way — not just eyeballed.
        assert "Berdasarkan temuan kami sejauh ini, tampaknya sebutan publik menunjukkan" in outreach["body_id"], \
            "ID: hypothesis-tagged context sentence must be hedged with the Indonesian wrapper"
        print(">>> VERIFIED (EN+ID): the one hypothesis-tagged context sentence (N4) is hedged, "
              "not stated as fact, in both languages.")
    if label.startswith("CASE 1"):
        # Case 6, folded into Case 1's own candidate (West Seram: real
        # N1/N2/N5, all fact, N4 never fires here) — proves the OTHER
        # half of the same guarantee: a fact-tagged context sentence is
        # stated plainly, NOT wrapped in the hedge phrase, in both
        # languages. Also the exact real example this rewrite was
        # requested against: N1's real underlying fact (no DRAM/DPP on
        # file) reframed as context rather than a gap report.
        assert "We understand your project is moving through the registration and validation process" \
            in outreach["body_en"], "EN: fact-tagged context sentence (N1) must be stated plainly"
        assert "Based on what we've found so far" not in outreach["body_en"], \
            "EN: a fact-tagged context sentence must NOT be hedged"
        assert "Kami memahami proyek Anda sedang melalui tahap registrasi dan validasi" in outreach["body_id"], \
            "ID: fact-tagged context sentence must be stated plainly, with a real Indonesian twin"
        assert "tampaknya" not in outreach["body_id"], \
            "ID: a fact-tagged context sentence must NOT be hedged"
        print(">>> VERIFIED (EN+ID): the fact-tagged context sentence (N1) is stated plainly, "
              "not hedged, in both languages — including the real DRAM/DPP-absence example.")
    print()
