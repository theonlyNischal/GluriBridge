"""
2026-09-04: thin (news-only) candidates used to disappear on any run that
didn't happen to rediscover them via that run's own independent live news
search — not a bug in matching, a real architectural gap (caught by the
user: "shouldn't this only grow, not shrink?"). Unlike a registry-sourced
candidate (rediscoverable indefinitely, as long as the underlying
registry listing exists), a thin candidate has no registry_ids at all —
it only ever existed because a past search happened to surface it.

This proves the fix (run_pipeline()'s prior_thin_candidates param, fed by
orchestrate.py's _read_prior_thin_candidates()) end to end, entirely
offline via news_hits_override — no live Tavily calls, deterministic,
same discipline as test_news_matching.py.
"""
import glob
import sys
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline

sruk_files = glob.glob("sample_data/sruk/*.json")

HIT_ORG_A = {
    "title": "Yayasan Nusantara Hijau Explores Carbon Monitoring Partnership",
    "url": "https://example-news.id/ynh-mrv-partnership",
    "content": (
        "Yayasan Nusantara Hijau, active in Central Kalimantan, has begun "
        "seeking a monitoring technology partner for its forest carbon "
        "project."
    ),
    "score": 0.8,
}
HIT_ORG_B = {
    "title": "Koperasi Mitra Lestari Launches Community Forestry Pilot in Riau",
    "url": "https://example-news.id/kml-riau-pilot",
    "content": "Koperasi Mitra Lestari has begun a community forestry pilot in Riau.",
    "score": 0.75,
}
HIT_ORG_A_FOLLOWUP = {
    "title": "Yayasan Nusantara Hijau Signs MRV Agreement",
    "url": "https://example-news.id/ynh-mrv-signed",
    "content": (
        "Yayasan Nusantara Hijau, active in Central Kalimantan, has signed "
        "a monitoring, reporting, and verification agreement to support its "
        "forest carbon project."
    ),
    "score": 0.9,
}

# --- Run 1: discovers ONLY Org A (Org B's hit isn't in this round at all) ---
run1 = run_pipeline(
    sruk_files=sruk_files, verra_files=[], brwa_list_path="sample_data/uploads/wa_list.json",
    news_hits_override={"q1": [HIT_ORG_A]},
)
run1_thin = [c for c in run1.candidates if c.data_richness == "thin"]
assert len(run1_thin) == 1, f"expected exactly 1 thin candidate from run 1, got {len(run1_thin)}"
assert run1_thin[0].org == "Yayasan Nusantara Hijau"
print(f"RUN 1: {run1.stats['news_thin_candidates_created']} new thin candidate(s) created, "
      f"{run1.stats['news_thin_candidates_carried_forward']} carried forward (expect 0 — first run).")

# --- Run 2: a genuinely DIFFERENT, unrelated hit (Org B) is all that's
# searched this round — Org A's own hit is NOT part of this run's news
# search at all, simulating a later independent run whose live search
# doesn't happen to re-surface it. Without prior_thin_candidates, Org A
# would simply vanish here — that's the exact bug this fix addresses. ---
run2 = run_pipeline(
    sruk_files=sruk_files, verra_files=[], brwa_list_path="sample_data/uploads/wa_list.json",
    news_hits_override={"q1": [HIT_ORG_B]},
    prior_thin_candidates=run1_thin,
)
run2_thin_orgs = {c.org for c in run2.candidates if c.data_richness == "thin"}
assert "Yayasan Nusantara Hijau" in run2_thin_orgs, \
    "Org A must be CARRIED FORWARD even though run 2's search never re-mentions it"
assert "Koperasi Mitra Lestari" in run2_thin_orgs, \
    "Org B must still be created fresh as a genuinely new thin candidate this run"
assert run2.stats["news_thin_candidates_created"] == 1, \
    "only Org B is genuinely NEW this run — Org A must not inflate this count"
assert run2.stats["news_thin_candidates_carried_forward"] == 1, \
    "exactly 1 prior thin candidate (Org A) was carried forward"
print(f"RUN 2: {run2.stats['news_thin_candidates_created']} new thin candidate(s) created "
      f"(Org B), {run2.stats['news_thin_candidates_carried_forward']} carried forward unchanged "
      f"(Org A — NOT re-mentioned in this run's own search, and still present).")

org_a_run2 = next(c for c in run2.candidates if c.org == "Yayasan Nusantara Hijau")
assert org_a_run2.news_evidence == [], \
    "Org A must be carried forward UNCHANGED (no new evidence) when this run's search never mentions it"

# --- Run 3: this time the search DOES re-mention Org A (a real follow-up
# article) — must CORROBORATE the carried-forward record (real new
# evidence added), never create a second, duplicate "Yayasan Nusantara
# Hijau" thin candidate. ---
run2_thin = [c for c in run2.candidates if c.data_richness == "thin"]
run3 = run_pipeline(
    sruk_files=sruk_files, verra_files=[], brwa_list_path="sample_data/uploads/wa_list.json",
    news_hits_override={"q1": [HIT_ORG_A_FOLLOWUP]},
    prior_thin_candidates=run2_thin,
)
run3_orgs_matching = [c for c in run3.candidates if c.org == "Yayasan Nusantara Hijau"]
assert len(run3_orgs_matching) == 1, \
    f"expected Org A to be re-corroborated in place, not duplicated — found {len(run3_orgs_matching)} copies"
assert len(run3_orgs_matching[0].news_evidence) == 1, \
    "the re-surfacing hit must be added as real new corroborating evidence"
assert run3_orgs_matching[0].news_evidence[0]["url"] == HIT_ORG_A_FOLLOWUP["url"]
assert run3.stats["news_thin_candidates_created"] == 0, \
    "Org A's re-surfacing must corroborate the carried-forward record, not create a new one"
print(f"RUN 3: Org A re-surfaced by a real follow-up article — corroborated in place "
      f"(1 record, {len(run3_orgs_matching[0].news_evidence)} evidence entr{'y' if len(run3_orgs_matching[0].news_evidence) == 1 else 'ies'}), "
      f"not duplicated. news_thin_candidates_created={run3.stats['news_thin_candidates_created']}.")

print()
print(">>> VERIFIED: a thin candidate not re-surfaced by a later run's search is carried forward "
      "unchanged, not lost; a genuinely new one is still created fresh; a re-surfaced one is "
      "corroborated in place, never duplicated.")
