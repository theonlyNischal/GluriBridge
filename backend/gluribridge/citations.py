"""
Citation resolution — pure annotation layer, no new facts computed or
invented. Given an already-computed reason (a need_detection_reason or a
credibility_components reason) and the candidate it came from, resolves
the SPECIFIC real source that backs it, using only data already on the
candidate: a real document from candidate.documents[] (real url +
retrieved_at), a real BRWA legal-decree pdf_url from brwa_overlap, a real
news article URL from news_evidence, a real Tier B contact_source_url, or
— when no single document exists — an honest citation saying so, never a
fabricated link. Runs AFTER scoring.py/dossier.py; neither is touched by
this module, and this module never changes a score or a reason's text.

Every citation is the same shape:
  {source_type: str, url: str|None, retrieved_at: str|None, note: str|None}
`url` is only ever a real value pulled from the candidate's own data, or
None. `note` is only populated when `url` is None, explaining honestly
why there's no single document to link — same "say so, don't default to
a negative-looking gap" principle as everything else in this pipeline.

Field-name -> document matching is based on the REAL section/sub_section
taxonomy confirmed across the actual dataset (2026-08-27), not guessed:
SRUK/SRN-PPI use section in {TECHNICAL, GENERAL, VALIDATION} and
sub_section in {DRAM, ADDITIONAL, REPORT_FINAL_VALIDATION, SPK_DOCUMENT};
Verra uses section values like "VCS Project Description",
"VCS Draft Project Description", "Project Boundary (KML File)", etc. —
there is no Verra sub_section usage at all, so DPP-equivalent documents
are matched by section, not sub_section.
"""


def _doc_citation(doc):
    return {"source_type": f"{doc.source} document: {doc.title}",
            "url": doc.url, "retrieved_at": doc.retrieved_at, "note": None}


def no_doc_citation(source_type, note):
    return {"source_type": source_type, "url": None, "retrieved_at": None, "note": note}


def _find_doc(candidate, predicate):
    for d in (candidate.documents or []):
        if predicate(d):
            return d
    return None


def registry_label(candidate):
    if candidate.primary_source == "sruk":
        return "SRUK registry record"
    if candidate.primary_source == "srn_ppi":
        return "SRN-PPI registry record"
    if candidate.primary_source == "verra":
        return "Verra registry record"
    if candidate.primary_source == "news":
        return "news-derived record (no registry)"
    return f"{candidate.primary_source} record"


def _field_source_retrieved_at(candidate, field_name):
    fs = (candidate.field_sources or {}).get(field_name)
    return fs.get("retrieved_at") if fs else None


def brwa_citation(candidate):
    """
    Real BRWA legal-decree pdf_url when one exists on the overlap — this
    data already existed on brwa_overlap.legal_documents, just wasn't
    linked from the prose claim before. Cites the FIRST legal document
    (a territory can have more than one decree on file); an honest
    no-document note when the overlap exists but carries no decree link
    at all (confirmed possible: BRWA policy_tier 'belum_ada' territories
    have no legal_documents).
    """
    overlap = candidate.brwa_overlap
    if not overlap:
        return no_doc_citation("BRWA customary-territory data", "No BRWA overlap on file for this candidate.")
    docs = overlap.get("legal_documents") or []
    if not docs:
        return no_doc_citation(f"BRWA territory record: {overlap.get('territory_name')}",
                        "This territory has a BRWA spatial record but no legal decree document on file "
                        "(confirmed real for lower policy tiers, e.g. 'belum_ada').")
    d = docs[0]
    return {"source_type": f"BRWA legal decree: {d.get('description')}",
            "url": d.get("pdf_url"), "retrieved_at": None, "note": None}


def news_citation(candidate, reason_text=""):
    """
    Matches a hedge-wrapped hypothesis reason back to the SPECIFIC real
    news_evidence hit whose URL is already embedded in that reason's own
    text (N4 always writes "(source: {url})" — see scoring.py) — never
    just "the first news hit," when the text itself names which one.
    Falls back to the first news_evidence entry if no URL match is found
    in the text.

    For a thin candidate's own why_gluri FALLBACK sentence specifically
    (the "not enough registry data..." text, which doesn't embed a URL
    itself and has no news_evidence at all — news_evidence is populated
    by CORROBORATION against an existing candidate, a separate process
    from thin-candidate creation), the real citable source is the
    founding news hit that created the candidate in the first place,
    which new_thin_candidate_from_hit() records as a "news"-source entry
    in merged_from with source_id = the real article URL — confirmed by
    reading news_matching.py directly, not assumed. Checked as the final
    fallback so it never overrides a real news_evidence match above.
    """
    for n in (candidate.news_evidence or []):
        url = n.get("url")
        if url and url in reason_text:
            return {"source_type": "News article", "url": url,
                     "retrieved_at": None, "note": None}
    if candidate.news_evidence:
        n = candidate.news_evidence[0]
        return {"source_type": "News article", "url": n.get("url"), "retrieved_at": None, "note": None}
    for m in (candidate.merged_from or []):
        if m.get("source") == "news" and m.get("source_id"):
            return {"source_type": "News article (originating hit)", "url": m["source_id"],
                     "retrieved_at": None, "note": None}
    return no_doc_citation("News-derived signal", "No news evidence URL on file for this record.")


def need_reason_citation(candidate, reason: dict):
    """
    reason is one need_detection_reasons entry: {rule, evidence_level, text}.
    """
    rule = reason.get("rule")
    text = reason.get("text", "")

    if rule in ("N1", "N2"):
        # Absence claims (neither DRAM nor DPP, or no technical doc on
        # file) — by construction these only fire when no such document
        # exists, so there is genuinely no single document to cite.
        return no_doc_citation(registry_label(candidate),
                        f"Confirmed by the absence of a DRAM/DPP and/or technical document in the "
                        f"{registry_label(candidate).lower()} — a negative finding has no single "
                        f"document to link.")
    if rule == "N3":
        return no_doc_citation("Verra registry record",
                        "Verra project status field, no single downloadable document backs a status label.")
    if rule == "N4":
        return news_citation(candidate, text)
    if rule == "N5":
        return no_doc_citation(registry_label(candidate),
                        "Derived from the registration workflow's step statuses on file — a computed "
                        "momentum signal, not a single document.")
    if rule == "N6":
        return no_doc_citation("Permenhut 6/2026 Pasal 61 (regulatory deadline logic)",
                        "Deadline computed from the registration date against the regulation's own "
                        "transitional window — no single per-candidate document to cite.")
    return no_doc_citation(registry_label(candidate), "No specific citation rule matched this reason.")


def registry_status_citation(candidate, text: str):
    if text.startswith("Has a DRAM or DPP on file"):
        doc = _find_doc(candidate, lambda d: (d.sub_section or "").upper() == "DRAM")
        if not doc:
            doc = _find_doc(candidate, lambda d: "project description" in (d.section or "").lower())
        if doc:
            return _doc_citation(doc)
        return no_doc_citation(registry_label(candidate),
                        "DRAM/DPP registration data is on file (see carbon_tracks) but has no single "
                        "downloadable document linked in this record.")
    if text.startswith("Present in at least one official registry"):
        retrieved = _field_source_retrieved_at(candidate, "name")
        return no_doc_citation(registry_label(candidate),
                        f"Registry presence confirmed via the {registry_label(candidate).lower()}'s own "
                        f"record" + (f" (retrieved {retrieved})" if retrieved else "") + "; a registry "
                        f"listing itself, not a single downloadable document.")
    if text.startswith("Has progressed beyond initial registration"):
        retrieved = (_field_source_retrieved_at(candidate, "registration_stage")
                     or _field_source_retrieved_at(candidate, "verra_status"))
        return no_doc_citation(registry_label(candidate),
                        f"Registration-stage field on the registry record" +
                        (f" (retrieved {retrieved})" if retrieved else "") + " — a status field, not a "
                        "single document.")
    return no_doc_citation(registry_label(candidate), "No specific citation rule matched this reason.")


def land_rights_reason_citation(candidate, text: str):
    if text.startswith("Formal land-rights category established") or text.startswith("Near ("):
        return brwa_citation(candidate)
    if text.startswith("Not yet available"):
        return no_doc_citation("BRWA customary-territory data",
                        "No coordinates on file — BRWA overlap was never checked, not a confirmed negative.")
    return no_doc_citation("BRWA customary-territory data",
                    "Checked against available BRWA data — no overlap found; no specific territory to cite.")


def geospatial_reason_citation(candidate, text: str):
    if text.startswith("Full project geometry on file"):
        doc = _find_doc(candidate, lambda d: "boundary" in (d.section or "").lower()
                         or "kml" in (d.section or "").lower())
        if doc:
            return _doc_citation(doc)
        return no_doc_citation(registry_label(candidate),
                        "Full geometry present on the record but no single boundary document (e.g. "
                        "a KML file) linked in this data.")
    if text.startswith("Coordinates on file") or text.startswith("Only a point location"):
        # Both fire when lat/lon ARE present — a real location field on
        # the registry record, not a document.
        return no_doc_citation(registry_label(candidate),
                        "Latitude/longitude fields on the registry record — a location field, not a "
                        "single document.")
    if text.startswith("Not yet available"):
        return no_doc_citation(registry_label(candidate), "No coordinates on file — nothing to cite.")
    return no_doc_citation(registry_label(candidate), "Unmapped geospatial reason.")


def contactability_reason_citation(candidate, text: str):
    contact = candidate.registrant_contact
    if text.startswith("Named registrant contact on file"):
        return no_doc_citation(registry_label(candidate),
                        "Registrant name/contact is a structured field on the registry record itself, "
                        "not a separate downloadable document.")
    if text.startswith("Contact resolved via organization's own website"):
        if contact and contact.contact_source_url:
            return {"source_type": "Organization's own website (Tier B)",
                     "url": contact.contact_source_url, "retrieved_at": None, "note": None}
        return no_doc_citation("Organization's own website (Tier B)", "Resolved but no source URL retained.")
    if text.startswith("Organization name known"):
        return no_doc_citation(registry_label(candidate),
                        "Organization name is on file, but no individual contact or Tier B website "
                        "resolution exists yet — nothing to cite for the missing contact itself.")
    return no_doc_citation(registry_label(candidate), "No contact information at all on file to cite.")


CREDIBILITY_RESOLVERS = {
    "registry_status": registry_status_citation,
    "land_rights": land_rights_reason_citation,
    "geospatial": geospatial_reason_citation,
    "contactability": contactability_reason_citation,
}


def attach_need_citations(candidate, need_detection_reasons: list) -> list:
    """Returns a NEW list — [{rule, evidence_level, text, citation}, ...] —
    the original list of dicts is not mutated in place."""
    return [{**r, "citation": need_reason_citation(candidate, r)} for r in need_detection_reasons]


def attach_credibility_citations(candidate, credibility_components: dict) -> dict:
    """
    Returns a NEW credibility_components dict where each component's
    `reasons` (previously list[str]) becomes list[{text, citation}] — the
    one necessary, minimal shape change to attach a per-reason citation
    at all, since a plain string has nowhere to hang a citation off of.
    Points/max are untouched; nothing here changes a score.
    """
    out = {}
    for key, comp in credibility_components.items():
        resolver = CREDIBILITY_RESOLVERS.get(key)
        new_reasons = []
        for text in comp["reasons"]:
            citation = resolver(candidate, text) if resolver else no_doc_citation(registry_label(candidate), "Unmapped component.")
            new_reasons.append({"text": text, "citation": citation})
        out[key] = {"points": comp["points"], "max": comp["max"], "reasons": new_reasons}
    return out
