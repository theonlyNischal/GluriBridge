"""
Assembles everything already computed elsewhere (identity-resolution
breakdowns, BRWA evidence, news evidence, need-detection reasons,
credibility components) into two persisted, frontend-shaped JSON exports —
matching the API endpoints already specified in the PRD:
  GET /candidates        -> list_view()  (one row per candidate)
  GET /candidates/{id}   -> detail_view() (everything, unabridged)

Nothing here computes anything new — this is purely an assembly/export
layer. If a number looks wrong here, the bug is in scoring.py/match.py, not here.
"""
import json
from dataclasses import asdict
from .scoring import score_candidate
from .dossier import build_dossier, render_dossier_markdown
from .outreach import generate_outreach, render_outreach_text
from .citations import attach_need_citations, attach_credibility_citations
from .activity_type import classify_activity_type


def score_label(need_score: float, credibility_score: float) -> str:
    """
    A display-only bucket label over the two ALREADY-COMPUTED, always-
    separate scores — never a blended number, never fed back into either
    score, never used as a scoring or sort input anywhere (list_row()'s
    consumers still sort on need_score/credibility_score directly). Purely
    a UI shorthand for "which axis, if either, is this candidate strong
    on" — see PROJECT_CONTEXT.md's "why need_score and credibility_score
    are separate, not one number" for why blending them into one figure is
    the one thing this project must never do; this label names a REGION
    of the two-axis space, it doesn't collapse it.

    Thresholds tuned against the real 144-candidate distribution
    (2026-08-27), not picked in the abstract:
      - need_score only takes 6 discrete values in real data (0, 11.1,
        22.2, 55.6, 88.9, 100 — it's a small integer point sum scaled to
        100), credibility_score is closer to continuous (11 distinct real
        values, 5.9 to 88.2).
      - The original draft used >=70/>=70 for strong_lead, which was
        EMPTY on real data: of the 30 real candidates with need_score>=70,
        the highest credibility_score among them is only 64.7 — a
        candidate with strong existing documentation/registration
        (high credibility) mechanically has fewer open gaps left for
        need_score to flag, so the two rarely both clear a 70 bar
        together. Lowered strong_lead's credibility bar to >=60
        specifically (not need_score's bar, and not confirmed's) to
        capture the one real near-miss case (need=88.9, cred=64.7)
        without reaching into the "mixed" middle — 60 sits cleanly
        between the real 58.8 and 64.7/70.6 values, not an arbitrary
        round number picked without checking the data.
      - Verified distribution after the fix: mixed 94 (65.3%),
        opportunity 29 (20.1%), early_signal 16 (11.1%), confirmed 4
        (2.8%), strong_lead 1 (0.7%) — every bucket populated, no bucket
        anywhere near swallowing the set.
    """
    if need_score >= 70 and credibility_score >= 60:
        return "strong_lead"
    if need_score >= 70 and credibility_score < 60:
        return "opportunity"
    if credibility_score >= 70 and need_score < 30:
        return "confirmed"
    if need_score < 30 and credibility_score < 30:
        return "early_signal"
    return "mixed"


def _serialize_documents(candidate):
    return [
        {"title": d.title, "url": d.url, "section": d.section, "sub_section": d.sub_section,
         "source": d.source, "retrieved_at": d.retrieved_at}
        for d in (candidate.documents or [])
    ]


def list_row(candidate) -> dict:
    """One row for the dashboard table. Deliberately thin — enough to
    sort/filter/skim, everything else lives behind detail_view()."""
    score = score_candidate(candidate)
    return {
        "candidate_id": candidate.candidate_id,
        "name": candidate.name,
        "org": candidate.org,
        "province": candidate.province,
        "district": candidate.district,
        "country": candidate.country,
        "sector": candidate.sector,
        "sources": [m["source"] for m in candidate.merged_from],
        "data_richness": candidate.data_richness,
        "verification_status": candidate.verification_status,
        "need_score": score["need_score"],
        "credibility_score": score["credibility_score"],
        "credibility_capped": score["credibility_capped"],
        # Additive display-only label over the two scores above — see
        # score_label()'s docstring. Never replaces need_score/
        # credibility_score, never itself a sort key.
        "score_label": score_label(score["need_score"], score["credibility_score"]),
        "compliance_badge": score["compliance"]["badge"],
        "has_brwa_evidence": candidate.brwa_overlap is not None,
        # The specific real territory idx to fetch real geometry for (via
        # the existing GET /territories/{idx}/geometry — no new endpoint,
        # no bulk polygon dump), when this candidate has a confirmed
        # overlap. None otherwise — has_brwa_evidence already covers the
        # boolean case; this is additive, for a dashboard-scale map that
        # needs to know WHICH territory, not just whether one exists.
        "brwa_idx": candidate.brwa_overlap["brwa_idx"] if candidate.brwa_overlap else None,
        "land_rights_category": candidate.land_rights_category,
        "has_named_contact": bool(candidate.registrant_contact and candidate.registrant_contact.name),
        # Broader than has_named_contact: true for ANY resolved contact_source
        # (Tier A registrant_name/registrant_email OR Tier B org_website),
        # including Tier B resolutions that only ever populate .email, never
        # .name. Used as a display-order-only sort tiebreaker in
        # export_pipeline_result() — see the comment there. Not a scoring
        # input anywhere.
        "has_resolved_contact": bool(candidate.registrant_contact and candidate.registrant_contact.contact_source),
        "document_count": len(candidate.documents or []),
        "news_evidence_count": len(candidate.news_evidence or []),
        # Real activity-type classification (2026-08-31) — see
        # activity_type.py's module docstring. activity_categories is
        # ALWAYS [] when activity_not_applicable is True; an empty list
        # with not_applicable=False is the separate "unclassified" state
        # (a real candidate this classifier's keyword/field coverage
        # doesn't yet reach) — the frontend must render these as two
        # visually distinct honest states, never one blended "Other."
        **{f"activity_{k}": v for k, v in classify_activity_type(candidate).items() if k != "not_applicable_reason"},
    }


def detail_view(candidate) -> dict:
    """
    Full audit trail for the candidate-detail page. Every number here is
    traceable to the exact rule/merge/source that produced it — this is the
    entire point of building it this way rather than an LLM call: every
    field below can be shown next to a 'why' in the UI without inventing
    an explanation after the fact.
    """
    score = score_candidate(candidate)
    # Citation enrichment — pure annotation, see citations.py's module
    # docstring: attaches a real source (document url, BRWA decree, news
    # url) or an honest no-single-document note to every reason, never
    # touching the score/points/text scoring.py already computed. Done
    # here, once, before build_dossier() so the dossier's why_gluri
    # inherits the same citations rather than resolving them twice.
    score = {
        **score,
        "need_detection_reasons": attach_need_citations(candidate, score["need_detection_reasons"]),
        "credibility_components": attach_credibility_citations(candidate, score["credibility_components"]),
    }
    dossier = build_dossier(candidate, score)
    outreach = generate_outreach(candidate, dossier)

    return {
        "candidate_id": candidate.candidate_id,
        "identity": {
            "name": candidate.name,
            "name_en": candidate.name_en,
            "org": candidate.org,
            "sector": candidate.sector,
            "province": candidate.province,
            "district": candidate.district,
            "country": candidate.country,
            "registry_ids": candidate.registry_ids,
            "registry_source_urls": candidate.registry_source_urls,
            "registration_stage": candidate.registration_stage,
            "registration_momentum": candidate.registration_momentum,
            "data_richness": candidate.data_richness,
            "verification_status": candidate.verification_status,
        },
        "location": {
            "latitude": candidate.latitude,
            "longitude": candidate.longitude,
            "has_full_geometry": candidate.geometry is not None,
            "area_ha": candidate.area_ha,
            # Set only when a coordinate WAS present and was discarded as
            # implausible (see match.py's flag_implausible_single_source_geo())
            # — distinct from genuinely never having had one, so the UI can
            # say which real state this is rather than collapsing both into
            # one generic "no location data" message.
            "geo_flagged_reason": candidate.geo_flagged_reason,
        },
        # WHY this candidate exists as one merged record — the actual
        # match-score breakdown for every source that merged into it,
        # confirmed still fully present on the object (org/name/desc/geo
        # component scores, geo_distance_km, conflict checks, everything
        # built and hardened across this whole project).
        "identity_resolution": {
            "merge_history": candidate.merged_from,
        },
        "carbon_tracks": {
            "dram": candidate.dram,
            "dpp": candidate.dpp,
            "lcam": candidate.lcam,
            "verra_status": candidate.verra_status,
            "verra_units": candidate.verra_units,
        },
        "documents": _serialize_documents(candidate),
        "contact": asdict(candidate.registrant_contact) if candidate.registrant_contact else None,
        # Real activity-type classification (2026-08-31) — see
        # activity_type.py's module docstring for the real test this is
        # built from. "categories" can hold 2-3 real tags at once (e.g. a
        # peatland-restoration-conservation project genuinely is all
        # three) — never forced into one primary type. not_applicable and
        # an empty (unclassified) categories list are deliberately
        # distinct, both surfaced honestly, never blended.
        "activity_type": classify_activity_type(candidate),
        # WHY the land-rights evidence is what it is — full BRWA match
        # detail (which territory, how far, what tier, the actual citable
        # decree URLs) — never just the final category with no trail.
        "land_rights": {
            "land_rights_category": candidate.land_rights_category,
            "brwa_overlap": candidate.brwa_overlap,
        },
        # WHY any news corroboration exists — the actual hit(s), never
        # blended into a fact-looking sentence without its source.
        "news_evidence": candidate.news_evidence,
        # THE SCORES, and — critically — the reasons behind every point of
        # both, split need vs. credibility per the design decision that a
        # single blended number hides too much.
        "scoring": {
            "need_score": score["need_score"],
            "credibility_score": score["credibility_score"],
            "credibility_capped": score["credibility_capped"],
            # Reverses an earlier explicit decision ("candidate detail page:
            # no label, both numbers at equal weight") — this round's
            # instruction explicitly asks for the quick-glance score_label
            # in the detail-page hero too. Reuses the exact same
            # score_label() already computed for list_row() below, not a
            # second parallel computation — one function, one real answer,
            # used in both places.
            "score_label": score_label(score["need_score"], score["credibility_score"]),
            "compliance": score["compliance"],
            "need_detection_reasons": score["need_detection_reasons"],
            "credibility_components": score["credibility_components"],
        },
        "dossier": {
            "structured": dossier,
            "markdown": render_dossier_markdown(dossier),
        },
        # Template-based outreach email, same no-LLM philosophy as the
        # dossier above — see outreach.py's module docstring. recipient_
        # status distinguishes "ready to send" from "needs manual lookup
        # before sending" from "can't generate at all yet", never
        # collapsed into one boolean.
        "outreach": {
            "structured": outreach,
            "text": render_outreach_text(outreach),
        },
    }


def export_pipeline_result(result, output_dir: str) -> dict:
    """
    Writes the two frontend-facing files to disk:
      {output_dir}/ranked_candidates.json  — list view, sorted by need_score
                                              (credibility_score also present
                                              on every row for client-side re-sort)
      {output_dir}/candidate_details.json  — dict keyed by candidate_id
    Also writes tentative_links.json and brwa_coverage_gaps.json — the
    review-queue and honesty-about-what's-missing outputs that should never
    be silently dropped just because they don't fit a ranked list.
    """
    import os
    os.makedirs(output_dir, exist_ok=True)

    rows = [list_row(c) for c in result.candidates]
    # Primary order is need_score, full stop — that's the actual scoring
    # output and this sort must never change it. The next three keys are a
    # DISPLAY-ORDER-ONLY tiebreaker for rows that land on the exact same
    # need_score (which happens often — need_score is a small discrete sum,
    # see PROJECT_CONTEXT.md Section 6). They do not feed back into
    # need_score or credibility_score, are not persisted as a "rank" or
    # "priority" field, and are not a scoring component anywhere in
    # scoring.py — this is purely a UI/export presentation concern: given a
    # tie, show the more credible, more contactable, better-evidenced
    # candidate first. Order: need_score desc, credibility_score desc,
    # has_resolved_contact desc, document_count desc.
    rows.sort(key=lambda r: (
        -r["need_score"],
        -r["credibility_score"],
        -int(r["has_resolved_contact"]),
        -r["document_count"],
    ))

    details = {c.candidate_id: detail_view(c) for c in result.candidates}

    with open(os.path.join(output_dir, "ranked_candidates.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, default=str, ensure_ascii=False)

    with open(os.path.join(output_dir, "candidate_details.json"), "w", encoding="utf-8") as f:
        json.dump(details, f, indent=2, default=str, ensure_ascii=False)

    with open(os.path.join(output_dir, "tentative_links.json"), "w", encoding="utf-8") as f:
        json.dump(result.tentative_links, f, indent=2, default=str, ensure_ascii=False)

    with open(os.path.join(output_dir, "brwa_coverage_gaps.json"), "w", encoding="utf-8") as f:
        json.dump(result.brwa_coverage_gaps, f, indent=2, default=str, ensure_ascii=False)

    with open(os.path.join(output_dir, "pipeline_stats.json"), "w", encoding="utf-8") as f:
        json.dump({
            **result.stats,
            "skipped_non_forestry": [{"path": p, "sector": s} for p, s in result.skipped_non_forestry],
            "errors": [{"path": p, "error": e} for p, e in result.errors],
        }, f, indent=2, default=str, ensure_ascii=False)

    return {
        "ranked_candidates_count": len(rows),
        "candidate_details_count": len(details),
        "output_dir": output_dir,
    }
