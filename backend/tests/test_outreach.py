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

# --- Case 5: mixed fact/hypothesis why_gluri reasons in one email, to
# directly prove the hedge language fires sentence-by-sentence, not just
# at the whole-email level. West Seram already has 3 real fact-tagged N1/
# N2/N5 reasons; attach a real-shaped news hit that trips N4 (the one
# hypothesis-tagged need-detection rule in scoring.py) so the opening
# paragraph has to hedge one sentence while stating the others plainly.
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
    ("CASE 5 — mixed fact + hypothesis why_gluri reasons in one opening paragraph", central_seram),
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
        # English hedge, pinned down exactly as before.
        assert "Based on what we've found so far, it appears that public mention" in outreach["body_en"], \
            "EN: hypothesis-tagged reason must be hedged, not stated as fact"
        assert "Reached technical/validation stage" in outreach["body_en"], \
            "EN: fact-tagged reasons in the same email must still be stated plainly"
        # Indonesian hedge, pinned down the same way — not just eyeballed.
        # The claim text itself stays English (see outreach.py's scope
        # boundary docstring); only the wrapper phrase is Indonesian.
        assert "Berdasarkan temuan kami sejauh ini, tampaknya public mention" in outreach["body_id"], \
            "ID: hypothesis-tagged reason must be hedged with the Indonesian wrapper"
        assert "Reached technical/validation stage" in outreach["body_id"], \
            "ID: fact-tagged reasons must still be stated plainly (dynamic content stays English by design)"
        # And confirm the ID hedge phrase is NOT sitting in front of a
        # fact-tagged sentence — the wrapper must be selective, not blanket.
        fact_sentence_idx = outreach["body_id"].find("Reached technical/validation stage")
        preceding = outreach["body_id"][max(0, fact_sentence_idx - 60):fact_sentence_idx]
        assert "tampaknya" not in preceding, "ID hedge phrase must not precede a fact-tagged sentence"
        print(">>> VERIFIED (EN): fact reasons stated plainly, hypothesis reason hedged.")
        print(">>> VERIFIED (ID): fact reasons stated plainly, hypothesis reason hedged with 'tampaknya', "
              "and the hedge is NOT applied to the fact-tagged sentence.")
    print()
