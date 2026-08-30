"""
Dossier generation — pure template, no LLM. Assembles already-computed
facts (from scoring.py, schema.py) into the one-page structure Gluri
actually asked for (Section 2/Q3 of the original discovery Q&A): identity,
why-recommended reasons tagged fact/hypothesis, contact route, required
data/permits, and follow-up questions. Never invents a fact not already
present on the candidate or its score dict.
"""
from .schema import UnifiedCandidateRecord
from .citations import news_citation, brwa_citation, no_doc_citation, registry_label


def _contact_route_text(candidate: UnifiedCandidateRecord) -> str:
    contact = candidate.registrant_contact
    if not contact or not contact.contact_source:
        return "No contact found by any tier — needs manual research before outreach."
    if "registrant" in contact.contact_source:
        return f"{contact.name}, via {contact.contact_source} record (Tier A — direct from the registry, no guessing)."
    if contact.contact_source == "org_website":
        conf = contact.contact_confidence or "unknown"
        return (f"{contact.email}, found via the organization's own website "
                f"(Tier B, {conf} confidence) — {contact.contact_source_url}")
    if contact.contact_source == "news_mention":
        return f"{contact.name}, mentioned in a news article (Tier C — lowest confidence, verify before relying on it)."
    if contact.contact_source == "manual_review":
        # A human-reviewed find (2026-08-31), NOT resolve_contact_tier_b()'s
        # automated match -- deliberately a distinct source value so it's
        # never confused with an automated org_website resolution. Handles
        # either a name, an email, or both, same as the automated tiers.
        who = contact.email or contact.name or "contact"
        conf = contact.contact_confidence or "unknown"
        return (f"{who}, found via manual research (human-reviewed, {conf} confidence) — {contact.contact_source_url}")
    return "Contact status unclear — check registrant_contact directly."


def _land_rights_text(candidate: UnifiedCandidateRecord) -> str:
    if candidate.land_rights_category:
        return f"Formal land-rights category on file: {candidate.land_rights_category}."
    if candidate.brwa_overlap:
        b = candidate.brwa_overlap
        return (f"Near ({b['distance_km']}km) a customary territory ('{b['territory_name']}', "
                f"{b['policy_tier']} tier) — real evidence, but not yet a formal category.")
    if candidate.latitude is None:
        return "Not yet checked — no coordinates on file to test against customary-territory data."
    return "Checked against available BRWA data — no overlap found within threshold distance."


def _compliance_text(candidate: UnifiedCandidateRecord, score: dict) -> str:
    c = score["compliance"]
    if c["badge"] == "not_applicable":
        return c["reason"]
    urgency = {"green": "Not urgent", "amber": "Approaching", "red": "Overdue"}[c["badge"]]
    return f"{urgency} — {c['reason']}"


def _dpp_validation_proxy(candidate: UnifiedCandidateRecord) -> list:
    """
    Dossier-only, UNSCORED evidence for Verra-track candidates — never a
    compliance signal (Pasal 22 / R024 stays deliberately unwired in
    compliance.py, see its NOT_WIRED_REASONS entry) and never fed into
    need_score or credibility_score (scoring.py doesn't call this at all).

    Pasal 22 requires FOUR things together: independent DPP validation,
    implementation per DPP, independent achievement verification, and a
    verification-results report. Verra's own process can plausibly speak to
    two of those four (validation, verification) — but Verra's validation/
    verification happens under VCS, an international standard-setter's own
    process, NOT Indonesia's Ministry-level Pasal 22 approval process. A
    project passing Verra's review is evidence that MAY be relevant to
    Pasal 22 — it is not the same legal fact as a confirmed Indonesian
    Ministry filing. That cross-jurisdiction gap is why this is tagged
    "hypothesis", not "fact", and why it can only ever be evidence a human
    reads, never something the pipeline scores on its own.
    """
    if not candidate.registry_ids.get("verra_project_id"):
        return []

    items = []

    validator = (candidate.dpp or {}).get("validator") if candidate.dpp else None
    if validator:
        items.append({
            "text": (f"Verra's own validation process shows {validator} reviewed this project under VCS, "
                      f"which MAY be relevant to Pasal 22's independent-validation requirement, but this is "
                      f"evidence from Verra's process, not a confirmed Indonesian Ministry filing. The other "
                      f"3 Pasal 22 requirements (implementation per DPP, independent verification, "
                      f"verification-results report) have no evidence either way."),
            "evidence_level": "hypothesis",
            "source": "verra_overview.validator",
        })

    issued = (candidate.verra_units or {}).get("issued") if candidate.verra_units else None
    if issued and issued > 0:
        items.append({
            "text": (f"Verra has issued {issued} VCUs for this project, which requires at least one completed "
                      f"verification event under VCS — this MAY be relevant to Pasal 22's independent-"
                      f"verification requirement, but again this is evidence from Verra's process, not a "
                      f"confirmed Indonesian Ministry filing. The other 3 Pasal 22 requirements (independent "
                      f"DPP validation, implementation per DPP, a verification-results report) have no "
                      f"evidence either way."),
            "evidence_level": "hypothesis",
            "source": "verra_units_summary.vcus_issued",
        })

    return items


def generate_next_questions(candidate: UnifiedCandidateRecord, score: dict) -> list:
    """
    Every question here is derived directly from a specific gap already
    visible on the candidate/score — never a generic filler question.
    Capped at 7, per the original spec (Gluri's own Q3 answer).
    """
    questions = []

    if candidate.dram is None and candidate.dpp is None:
        questions.append("Has a DRAM or DPP been started yet, even in draft form?")

    has_technical_doc = any((getattr(d, "section", None) or "").upper() == "TECHNICAL" for d in (candidate.documents or []))
    if not has_technical_doc:
        questions.append("What's currently blocking submission of technical/monitoring documentation?")

    if candidate.latitude is None:
        questions.append("Could you share the exact project site coordinates or boundary?")
    elif candidate.geometry is None:
        questions.append("Do you have a georeferenced project boundary (KML/shapefile) beyond a single point location?")

    if candidate.land_rights_category is None and candidate.brwa_overlap is None:
        questions.append("Is this site within or adjacent to any customary/indigenous (adat) territory?")
    elif candidate.brwa_overlap and candidate.brwa_overlap["relationship"] == "near" and candidate.land_rights_category is None:
        questions.append(f"We found a nearby customary territory ('{candidate.brwa_overlap['territory_name']}') — "
                          f"can you confirm whether the project site overlaps it?")

    if score["compliance"]["badge"] in ("amber", "red"):
        questions.append("Has your organization filed the Pasal 61 transitional report to the Ministry yet?")

    if not candidate.registrant_contact or not candidate.registrant_contact.contact_source:
        questions.append("Who's the best point of contact for technical/MRV discussions?")

    if candidate.primary_source == "verra" and candidate.dpp is None:
        questions.append("Is this project pursuing the international (Verra/DPP) track, the domestic (SRUK/DRAM) track, or both?")

    return questions[:7]


def suggest_poc(candidate: UnifiedCandidateRecord, score: dict) -> str:
    """One or two sentences, gap-driven — never a generic filler when a
    real signal exists to shape the suggestion."""
    if candidate.data_richness == "thin":
        return ("Not enough is known yet to suggest a specific pilot — this is an unverified news-sourced lead. "
                "Manual research (confirm the organization, find a real contact) needs to happen before any PoC discussion.")

    if score["need_score"] == 0:
        return ("No clear documentation gap detected — if there's still an opportunity here, it's likely on the "
                "measurement/verification side rather than baseline reporting. Worth a direct conversation "
                "about their current MRV approach before proposing a specific pilot.")

    parts = []
    if candidate.dram is None and candidate.dpp is None:
        parts.append("a short (4-6 week) MRV baseline assessment using satellite-based AGB estimation to support DRAM/DPP preparation")
    if candidate.land_rights_category is None and candidate.brwa_overlap is not None:
        parts.append("paired with a lightweight desk review of land-tenure status before any site engagement")

    if not parts:
        return "Insufficient signal to suggest a specific pilot scope yet — recommend a discovery call first."
    return "Suggested starting point: " + ", ".join(parts) + "."


def build_dossier(candidate: UnifiedCandidateRecord, score: dict) -> dict:
    # score["need_detection_reasons"] entries already carry a "citation"
    # key by the time build_dossier() sees them — export.py enriches the
    # score dict via citations.attach_need_citations() before calling
    # build_dossier(), so this just carries it through, same as text/
    # evidence_level. The two synthetic fallback cases below (no reasons
    # fired at all) have no real scored reason to key a citation off of,
    # so they resolve their own honest citation directly.
    why_gluri = [
        {"text": r["text"], "evidence_level": r["evidence_level"], "citation": r.get("citation")}
        for r in score["need_detection_reasons"]
    ]
    if not why_gluri:
        if candidate.data_richness == "thin":
            # A thin candidate's only real evidence is the news hit it was
            # created from — cite that, not a generic fallback.
            why_gluri = [{"text": "Not enough registry data exists yet to detect specific documentation gaps — "
                                   "this lead is unverified and comes from a single news mention, not a registry check.",
                           "evidence_level": "hypothesis",
                           "citation": news_citation(candidate)}]
        else:
            why_gluri = [{"text": "No specific documentation gaps detected across the registries actually checked "
                                   "for this candidate.", "evidence_level": "fact",
                           "citation": no_doc_citation(registry_label(candidate),
                               "A clean-record finding — no single document proves the absence of a gap; "
                               "confirmed by checking every field this pipeline's rules test against.")}]

    return {
        "candidate_id": candidate.candidate_id,
        "header": {
            "name": candidate.name,
            "org": candidate.org,
            "registry_ids": candidate.registry_ids,
            "need_score": score["need_score"],
            "credibility_score": score["credibility_score"],
            "data_richness": candidate.data_richness,
        },
        "why_gluri": why_gluri,
        "land_and_regulatory": {
            "land_rights_text": _land_rights_text(candidate),
            "land_rights_citation": brwa_citation(candidate) if (candidate.land_rights_category or candidate.brwa_overlap)
                else no_doc_citation("BRWA customary-territory data",
                    "No coordinates on file — BRWA overlap was never checked." if candidate.latitude is None
                    else "Checked against available BRWA data — no overlap found within threshold distance."),
            "compliance_text": _compliance_text(candidate, score),
        },
        "contact_route": _contact_route_text(candidate),
        "suggested_poc": suggest_poc(candidate, score),
        "next_questions": generate_next_questions(candidate, score),
        # Additive, dossier-only, unscored — see _dpp_validation_proxy's
        # docstring. Empty list when not applicable (non-Verra candidate,
        # or no validator/issued-units evidence on file).
        "dpp_validation_proxy": _dpp_validation_proxy(candidate),
    }


def render_dossier_markdown(dossier: dict) -> str:
    h = dossier["header"]
    lines = [
        f"**{h['name']}**",
        f"{h['org']} · need {h['need_score']} / credibility {h['credibility_score']} · {h['data_richness']}",
        "",
        "**Why Gluri**",
    ]
    for item in dossier["why_gluri"]:
        lines.append(f"- *({item['evidence_level']})* {item['text']}")

    lines += [
        "",
        "**Land & regulatory position**",
        dossier["land_and_regulatory"]["land_rights_text"],
        dossier["land_and_regulatory"]["compliance_text"],
        "",
        "**Contact route**",
        dossier["contact_route"],
        "",
        "**Suggested PoC**",
        dossier["suggested_poc"],
    ]

    proxy_items = dossier.get("dpp_validation_proxy") or []
    if proxy_items:
        lines += [
            "",
            "**DPP validation proxy (unscored evidence — not a compliance check)**",
        ]
        for item in proxy_items:
            lines.append(f"- *({item['evidence_level']})* {item['text']}")

    lines += [
        "",
        "**Next questions**",
    ]
    for i, q in enumerate(dossier["next_questions"], 1):
        lines.append(f"{i}. {q}")

    return "\n".join(lines)
