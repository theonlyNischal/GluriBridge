"""
Deterministic scoring — no LLM. Same reasoning as the normalizer: needs to
be auditable, reproducible, and cheap to re-run daily across every
candidate. The LLM's only role in this pipeline is turning an already-
computed score + reasons list into dossier prose, never deciding the score.
"""
from datetime import datetime, timezone
from .schema import UnifiedCandidateRecord
from .compliance import evaluate_compliance

TECH_PARTNER_KEYWORDS = [
    "teknologi pemantauan", "remote sensing partner", "verifikasi karbon",
    "mrv partner", "monitoring technology", "mitra teknologi",
]


def score_need(candidate: UnifiedCandidateRecord) -> tuple:
    """
    Core need-detection rules, working entirely off fields already present
    on the unified record — no satellite data required (GFW is explicitly
    Phase 2, per earlier design). Returns (raw_points 0-45, reasons list,
    compliance dict). The compliance dict is returned separately so it can
    be shown as its own visible badge, never hidden inside just a point
    value — see compliance.py and the conversation decision behind this.
    """
    points = 0
    reasons = []

    has_domestic_track = candidate.dram is not None
    has_intl_track = candidate.dpp is not None

    # N1 — reached technical/validation stage but neither track's core
    # document exists. DRAM and DPP are legally separate tracks (Permenhut
    # Pasal 11 vs 20-23) — a candidate missing DRAM but having DPP (a
    # Verra-track project) is NOT a gap, so this only fires when BOTH are
    # absent, not just one.
    if candidate.registration_stage in (2, 3) and not has_domestic_track and not has_intl_track:
        points += 20
        reasons.append({
            "rule": "N1", "evidence_level": "fact",
            "text": "Reached technical/validation stage with neither a DRAM nor a DPP on file.",
        })

    # N2 — no technical documents submitted on either track at all.
    # Gated to registry-sourced candidates only: for a 'news' primary_source,
    # "no registry documents" is trivially true by definition (a thin lead
    # was never in a registry to begin with) and fires uniformly for every
    # single thin candidate — not a discriminating signal there, just a
    # fixed floor dressed up as one. Confirmed on a real test run: this was
    # the only rule contributing to a thin candidate's need-score, when the
    # actually meaningful signal for that population is N4.
    if candidate.primary_source in ("sruk", "srn_ppi", "verra"):
        has_technical_doc = any(
            (getattr(d, "section", None) or "").upper() == "TECHNICAL" for d in (candidate.documents or [])
        )
        if not has_technical_doc and not has_domestic_track and not has_intl_track:
            points += 15
            reasons.append({
                "rule": "N2", "evidence_level": "fact",
                "text": "No technical/monitoring documentation submitted to any registry.",
            })

    # N3 — registered on Verra but no listed status progress at all
    # (a coarse proxy; a real 'stalled >12 months' check needs a
    # last-updated timestamp this schema doesn't currently carry — flagged
    # here rather than faked)
    if candidate.primary_source == "verra" and candidate.verra_status in (None, "Pipeline listing requested (under development)"):
        points += 10
        reasons.append({
            "rule": "N3", "evidence_level": "fact",
            "text": f"Verra status is early-stage ({candidate.verra_status}) with no further progress recorded.",
        })

    # N4 — news explicitly mentions seeking a monitoring/tech partner
    for hit in (candidate.news_evidence or []):
        text = (hit.get("title") or "") + " " + (hit.get("content") or "")
        if any(k.lower() in text.lower() for k in TECH_PARTNER_KEYWORDS):
            points += 10
            reasons.append({
                "rule": "N4", "evidence_level": "hypothesis",
                "text": f"Public mention suggests active search for a monitoring/technology partner (source: {hit.get('url')}).",
            })
            break

    # N5 — registration actively progressing
    if candidate.registration_momentum == "high":
        points += 5
        reasons.append({
            "rule": "N5", "evidence_level": "fact",
            "text": "Registration is actively progressing — organization is currently engaged with the process.",
        })

    # N6 — compliance deadline urgency (Permenhut Pasal 61). Deliberately
    # small point values relative to N1/N2 — this is a timing signal, not
    # primary evidence of need, and 'red' doesn't mean confirmed
    # non-compliance (see compliance.py's stated limitation).
    compliance = evaluate_compliance(candidate)
    if compliance["badge"] == "red":
        points += 10
        reasons.append({"rule": "N6", "evidence_level": "fact", "text": compliance["reason"]})
    elif compliance["badge"] == "amber":
        points += 5
        reasons.append({"rule": "N6", "evidence_level": "fact", "text": compliance["reason"]})

    return min(points, 45), reasons, compliance


def score_registry_status(candidate: UnifiedCandidateRecord) -> tuple:
    points, reasons = 0, []
    in_any_registry = any(v is not None for v in candidate.registry_ids.values())
    if in_any_registry:
        points += 10
        reasons.append("Present in at least one official registry (SRUK/SRN-PPI/Verra).")
    if (candidate.registration_stage or 0) >= 2 or candidate.verra_status is not None:
        points += 10
        reasons.append("Has progressed beyond initial registration.")
    if candidate.dram is not None or candidate.dpp is not None:
        points += 5
        reasons.append("Has a DRAM or DPP on file.")
    return points, reasons


def score_land_rights(candidate: UnifiedCandidateRecord) -> tuple:
    points, reasons = 0, []
    if candidate.land_rights_category:
        points = 25
        reasons.append(f"Formal land-rights category established: {candidate.land_rights_category}.")
    elif candidate.brwa_overlap and candidate.brwa_overlap.get("relationship") == "near":
        points = 10
        reasons.append(
            f"Near ({candidate.brwa_overlap['distance_km']}km) a customary territory "
            f"({candidate.brwa_overlap['policy_tier']} tier) — not yet a formal category, but real evidence."
        )
    elif candidate.latitude is None:
        reasons.append("Not yet available — candidate has no coordinates, so BRWA overlap was never checked.")
    else:
        reasons.append("No BRWA overlap found within threshold distance.")
    return points, reasons


def score_geospatial(candidate: UnifiedCandidateRecord) -> tuple:
    """Renormalized when geometry/coordinates are unavailable, per the
    earlier design decision — most candidates (SRUK/SRN-PPI) have no
    polygon at all, only Verra reliably provides one."""
    if candidate.latitude is None or candidate.longitude is None:
        return 0, ["Not yet available — no coordinates on file."]
    points, reasons = 10, ["Coordinates on file."]
    if candidate.geometry is not None:
        points += 10
        reasons.append("Full project geometry on file (not just a point).")
    else:
        reasons.append("Only a point location, no full geometry — component score capped lower.")
    return points, reasons


def score_contactability(candidate: UnifiedCandidateRecord) -> tuple:
    contact = candidate.registrant_contact
    if contact and contact.name and contact.contact_source and "registrant" in contact.contact_source:
        return 15, [f"Named registrant contact on file: {contact.name} ({contact.contact_source})."]
    if contact and contact.contact_source == "org_website":
        if contact.contact_confidence == "high":
            return 10, ["Contact resolved via organization's own website (Tier B, high confidence — copyright footer self-match)."]
        return 7, ["Contact resolved via organization's own website (Tier B, medium confidence — first-person language only, no copyright confirmation)."]
    if contact and contact.org:
        return 5, ["Organization name known, but no named individual contact yet — needs manual lookup."]
    return 0, ["No contact information available at all."]


def score_candidate(candidate: UnifiedCandidateRecord) -> dict:
    """
    Two separate axes, not one blended number — a low need-score (mature,
    well-documented project) should never drag down an otherwise strong
    candidate, and a high need-score alone (e.g. a thin news lead that
    happens to say "seeking a tech partner") shouldn't look credible just
    because of that one signal. Gluri can sort by either axis.
    """
    registry_pts, registry_reasons = score_registry_status(candidate)
    land_pts, land_reasons = score_land_rights(candidate)
    geo_pts, geo_reasons = score_geospatial(candidate)
    contact_pts, contact_reasons = score_contactability(candidate)
    need_raw, need_reasons, compliance = score_need(candidate)

    credibility_raw = registry_pts + land_pts + geo_pts + contact_pts   # out of 85
    credibility_score = round(credibility_raw / 85 * 100, 1)
    credibility_capped = False
    if candidate.data_richness == "thin":
        # A thin candidate naturally scores low here already (no registry
        # presence, usually no coordinates) — this is a hard backstop, not
        # the primary mechanism, consistent with never relying solely on an
        # emergent low score for a data-quality-flagged case.
        credibility_capped = credibility_score > 30
        credibility_score = min(credibility_score, 30)

    need_score = round(min(need_raw, 45) / 45 * 100, 1)
    # Deliberately NOT capped for thin candidates — this is precisely where
    # news-sourced leads can legitimately score high (e.g. explicit
    # "seeking a tech partner" language, rule N4) even with near-zero
    # credibility. Collapsing that into one number would have hidden
    # exactly the signal news search exists to surface.

    return {
        "candidate_name": candidate.name,
        "org": candidate.org,
        "data_richness": candidate.data_richness,
        "need_score": need_score,
        "credibility_score": credibility_score,
        "credibility_capped": credibility_capped,
        "compliance": compliance,
        "credibility_components": {
            "registry_status": {"points": registry_pts, "max": 25, "reasons": registry_reasons},
            "land_rights": {"points": land_pts, "max": 25, "reasons": land_reasons},
            "geospatial": {"points": geo_pts, "max": 20, "reasons": geo_reasons},
            "contactability": {"points": contact_pts, "max": 15, "reasons": contact_reasons},
        },
        "need_detection_reasons": need_reasons,
    }


def rank_candidates(candidates: list, sort_by: str = "need_score") -> list:
    """
    sort_by: 'need_score' or 'credibility_score' — Gluri picks the lens,
    per the design decision to show both rather than blend into one number.
    """
    scored = [score_candidate(c) for c in candidates]
    return sorted(scored, key=lambda s: -s[sort_by])
