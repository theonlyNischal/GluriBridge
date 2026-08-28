"""
News/campaign search (Tavily) as a discovery signal, per the design agreed
earlier: every hit either (a) corroborates an EXISTING candidate (from
SRUK/SRN-PPI/Verra resolution — never overwrites their fields, only adds
evidence), or (b) becomes a new 'thin' candidate if it matches nothing, or
(c) is discarded outright if no usable organization identity can even be
extracted. A hit is never trusted as a standalone fact.
"""
import re
import uuid
from rapidfuzz import fuzz
from .schema import UnifiedCandidateRecord, RegistrantContact
from .match import strip_legal

# Query templates: province x keyword, EN + Indonesian. This is the
# automated version of what Gluri told us directly they'd do manually
# (search news/campaigns/existing programs, then cold-email public contacts).
QUERY_TEMPLATES_EN_BY_PROVINCE = [
    '"forest carbon project" {province} Indonesia',
    'MRV forest carbon technology partner Indonesia {province}',
]
QUERY_TEMPLATES_ID_BY_PROVINCE = [
    '"proyek karbon hutan" {province}',
    'kerjasama karbon kehutanan Indonesia {province}',
]
# Not province-specific — run once globally, not once per province
# (confirmed real inefficiency: with 4 provinces, running these here would
# fire 4 identical duplicate queries for zero additional coverage).
QUERY_TEMPLATES_GLOBAL = [
    '"remote sensing" forest carbon partner Indonesia',
    'MRV kehutanan mitra teknologi pemantauan',
]

# Indonesian organizational-entity prefixes — used to extract a plausible
# org name out of free-text title/content. This is a heuristic, not a
# solved NLP problem: it will miss org names that don't start with one of
# these tokens, and can occasionally grab a false positive. Treat any
# extraction from this as HYPOTHESIS-tier evidence, never fact-tier.
ORG_PREFIX_PATTERN = re.compile(
    r"\b(PT\.?\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,4}"
    r"|CV\.?\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,4}"
    r"|Koperasi\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,4}"
    r"|Yayasan\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,4}"
    r"|LPHD\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,3}"
    r"|Kelompok\s+Tani\s+[A-Z][\w.&\-]*(?:\s+[A-Z][\w.&\-]*){0,3})"
)

CORROBORATION_THRESHOLD = 85   # matches match.py's auto_merge bar — same confidence bar for "this is definitely them"
THIN_CANDIDATE_FLOOR = 40      # below this, the hit is too weak to even create a speculative lead — discard

# Below this, a hit isn't even a CANDIDATE for corroboration — it's org-score
# too weak to be worth a content check at all. Between this and 100, org-name
# shape alone is not trusted; corroboration additionally requires the
# article's own text to mention something specific to the candidate.
# Confirmed necessary on real data: two genuinely different, unrelated real
# Indonesian foundations — "Yayasan Meramu Alam Nusantara" and "Yayasan
# Konservasi Alam Nusantara" — scored 83.87 on org-name shape alone (3 of 4
# tokens identical, common "Yayasan [word] Alam Nusantara" naming template).
# That was a near-miss, not a fluke: the same real candidate pool has several
# other real, unrelated foundations sharing the same templated naming
# pattern (Yayasan Konservasi Pesisir Indonesia, Yayasan Gajah Sumatera,
# Yayasan Natural Kapital Indonesia, ...). Same principle as
# contact_resolution.py's Tier B fix: prefer content-based verification over
# string matching wherever an adversarial (or here, just template-driven)
# false match is plausible.
CONTENT_CHECK_BAND_FLOOR = 80

# Excluded from the "distinctive keyword" check — domain-generic terms that
# appear in nearly every candidate's name/description BY CONSTRUCTION (every
# query already searches for "forest carbon project"/"proyek karbon hutan"),
# so requiring a match on these would confirm nothing. A real distinctive
# keyword is something like a place name, a specific project name, or a
# named methodology — not a word that's generic to the whole domain.
GENERIC_KEYWORD_STOPWORDS = {
    "hutan", "karbon", "carbon", "forest", "forestry", "kehutanan", "proyek", "project",
    "pengurangan", "reduction", "emisi", "emission", "emissions", "climate", "iklim",
    "conservation", "konservasi", "restoration", "restorasi", "pemulihan", "pengelolaan",
    "management", "trading", "perdagangan", "offset", "offsetting", "credit", "credits",
    "kredit", "unit", "units", "grk", "ghg", "mitigasi", "mitigation", "indonesia",
    "indonesian", "national", "nasional", "program", "initiative", "inisiatif", "aksi",
    "action", "kegiatan", "activity", "activities", "sektor", "sector", "kawasan", "area",
    "wilayah", "lahan", "land", "development", "pengembangan", "and", "the", "of", "in",
    "for", "with", "from", "to", "on", "at", "by", "di", "dan", "untuk", "melalui",
    "pada", "dengan", "yang", "dari", "ke", "atas", "adalah", "akan", "yaitu", "serta",
}


def _distinctive_keywords(text: str) -> set:
    words = re.findall(r"[A-Za-z][A-Za-z\-']{3,}", text or "")
    return {w.lower() for w in words if w.lower() not in GENERIC_KEYWORD_STOPWORDS}


def content_corroborates(hit: dict, candidate: UnifiedCandidateRecord) -> tuple:
    """
    Requires the hit's own text to reference something SPECIFIC to this
    candidate — never just a similarly-shaped org name. Returns
    (verified: bool, reason: str) so callers can show their work rather
    than getting an opaque True/False.

    (a) the candidate's district or province name appears in the text, OR
    (b) a distinctive keyword (not a domain-generic word — see
        GENERIC_KEYWORD_STOPWORDS) shared between the candidate's own
        name/description and the hit's text.

    A candidate with no district/province AND no name/description worth
    extracting keywords from can never pass this check — that's correct,
    not a bug: there's nothing specific to verify against, so the hit
    should not be allowed to corroborate on org-name shape alone.
    """
    text = " ".join(filter(None, [hit.get("title", ""), hit.get("content", ""), hit.get("raw_content", "")])).lower()

    for loc in (candidate.district, candidate.province):
        if loc and loc.strip() and loc.strip().lower() in text:
            return True, f"location match: '{loc}' found in hit text"

    candidate_keywords = _distinctive_keywords(f"{candidate.name or ''} {candidate.description or ''}")
    hit_keywords = _distinctive_keywords(text)
    shared = candidate_keywords & hit_keywords
    if shared:
        return True, f"distinctive keyword match: {sorted(shared)}"

    return False, "no district/province or distinctive keyword found in hit text"


def build_queries(provinces: list = None) -> list:
    provinces = provinces or []
    queries = list(QUERY_TEMPLATES_GLOBAL)  # run once, regardless of province count
    for province in provinces:
        for template in QUERY_TEMPLATES_EN_BY_PROVINCE + QUERY_TEMPLATES_ID_BY_PROVINCE:
            q = re.sub(r"\s+", " ", template.format(province=province).strip())
            queries.append(q)
    return queries


def extract_org_candidates(title: str, content: str) -> list:
    """Returns a de-duplicated list of plausible org-name strings found in
    the hit's title+content. May return an empty list — that's expected and
    should route the hit to discard, not to a guessed fallback."""
    text = f"{title or ''} {content or ''}"
    matches = ORG_PREFIX_PATTERN.findall(text)
    seen, out = set(), []
    for m in matches:
        m_norm = re.sub(r"\s+", " ", m).strip()
        if m_norm.lower() not in seen:
            seen.add(m_norm.lower())
            out.append(m_norm)
    return out


def _best_candidate_match(org_candidates: list, title: str, existing_candidates: list):
    """Fuzzy-matches extracted org names (and the hit title, as a fallback
    against project names) against every existing candidate's org/name.
    Returns (candidate, score) for the single best match, or (None, 0)."""
    best_candidate, best_score = None, 0
    for existing in existing_candidates:
        for org_candidate in org_candidates:
            score = fuzz.token_sort_ratio(strip_legal(org_candidate), strip_legal(existing.org or ""))
            if score > best_score:
                best_candidate, best_score = existing, score
        # also try the hit title against the candidate's project name —
        # a news article often names the PROJECT, not the company
        if title and existing.name:
            score = fuzz.token_sort_ratio(title, existing.name)
            if score > best_score:
                best_candidate, best_score = existing, score
    return best_candidate, best_score


def process_hit(hit: dict, query: str, existing_candidates: list) -> dict:
    """
    Processes a single Tavily result dict against the resolved candidate
    list. Returns an action record — never mutates existing_candidates
    directly here (caller applies the action so it's auditable/testable
    independent of side effects).

    Returns: {"action": "corroborate" | "new_thin_candidate" | "discard",
              "target_candidate": <UnifiedCandidateRecord or None>,
              "org_candidates": [...], "match_score": float, "hit": hit}
    """
    title = hit.get("title", "")
    content = hit.get("content", "") or hit.get("raw_content", "") or ""
    url = hit.get("url", "")

    org_candidates = extract_org_candidates(title, content)

    if not org_candidates:
        return {"action": "discard", "target_candidate": None, "org_candidates": [],
                "match_score": 0, "hit": hit, "reason": "no extractable organization identity"}

    best_candidate, best_score = _best_candidate_match(org_candidates, title, existing_candidates)

    if best_candidate is not None and best_score >= CONTENT_CHECK_BAND_FLOOR:
        # Org-name shape alone is never enough in this band (80-100) — see
        # CONTENT_CHECK_BAND_FLOOR's docstring for why. Content verification
        # decides, not the score margin.
        verified, content_reason = content_corroborates(hit, best_candidate)
        if verified:
            return {"action": "corroborate", "target_candidate": best_candidate,
                    "org_candidates": org_candidates, "match_score": best_score, "hit": hit,
                    "content_check": content_reason}
        # Org-name shape suggested a match but nothing in the article ties
        # it to THIS specific candidate — capped, never silently corroborated
        # on shape alone. Falls through to the same floor logic below.
        best_score_capped_reason = f"org-name shape scored {best_score:.2f} but content check failed: {content_reason}"
        if best_score >= THIN_CANDIDATE_FLOOR:
            return {"action": "new_thin_candidate", "target_candidate": None,
                    "org_candidates": org_candidates, "match_score": best_score, "hit": hit,
                    "reason": best_score_capped_reason}
        return {"action": "discard", "target_candidate": None, "org_candidates": org_candidates,
                "match_score": best_score, "hit": hit, "reason": best_score_capped_reason}

    if best_score >= THIN_CANDIDATE_FLOOR:
        # Not confident enough to corroborate an existing candidate, but
        # not so weak we should throw it away — becomes its own thin lead.
        return {"action": "new_thin_candidate", "target_candidate": None,
                "org_candidates": org_candidates, "match_score": best_score, "hit": hit}

    return {"action": "discard", "target_candidate": None, "org_candidates": org_candidates,
            "match_score": best_score, "hit": hit, "reason": "matched nothing above the thin-candidate floor"}


def apply_corroboration(candidate: UnifiedCandidateRecord, action: dict, query: str) -> UnifiedCandidateRecord:
    """Attaches a news hit as corroborating evidence — never overwrites any
    SRUK/SRN-PPI/Verra-sourced field. Tier 4, hypothesis-level always.

    Deduped by URL: the same real-world article routinely surfaces under
    multiple province queries by design (confirmed at real scale, not a
    hypothetical edge case — e.g. a Kutai Kartanegara article legitimately
    ranked for both Central and West Kalimantan queries in testing). Without
    this, every re-surfacing appends a byte-identical news_evidence entry.
    If the same URL corroborates again with a HIGHER match_score (e.g. a
    cleaner org extraction from a different query's hit), the existing
    entry is updated in place rather than duplicated — keeps the best
    evidence for a given source, never loses it, never repeats it."""
    hit = action["hit"]
    url = hit.get("url")
    new_entry = {
        "title": hit.get("title"), "url": url, "query": query,
        "match_score": action["match_score"], "evidence_level": "hypothesis", "source_tier": 4,
    }
    if url:
        for existing in candidate.news_evidence:
            if existing.get("url") == url:
                if action["match_score"] > existing.get("match_score", 0):
                    existing.update(new_entry)
                return candidate
    candidate.news_evidence.append(new_entry)
    return candidate


def new_thin_candidate_from_hit(action: dict, query: str) -> UnifiedCandidateRecord:
    """Creates a new candidate from an unmatched news hit — capped identity
    only, `data_richness='thin'` per the design agreed earlier. This is a
    STARTING point for the enrichment funnel (site fetch, targeted
    re-search, geocoding) described in the original PRD — NOT built here;
    this function only does the entry point (Step 1: check against
    existing candidates, create if genuinely new)."""
    hit = action["hit"]
    # Prefer the SHORTEST extracted candidate, not the first — confirmed on
    # real test data that headline-style text produces multiple candidates
    # from the same organization, and the over-extended one (which greedily
    # swallowed a trailing capitalized headline word, e.g. "...Reports
    # Progress") tends to appear before the correct, shorter extraction,
    # not after. Shortest is a better proxy for "just the org name" than
    # "whichever came first."
    org_guess = min(action["org_candidates"], key=len) if action["org_candidates"] else None
    rec = UnifiedCandidateRecord(
        candidate_id=str(uuid.uuid4()),
        primary_source="news",
        data_richness="thin",
        verification_status="unverified",
        name=hit.get("title"),
        org=org_guess,
        registrant_contact=RegistrantContact(name=None, org=org_guess, contact_source=None),
    )
    rec.field_sources["name"] = {"source": "news", "source_tier": 4, "retrieved_at": None}
    rec.merged_from.append({
        "source": "news", "source_id": hit.get("url"), "match_score": action["match_score"],
        "match_status": "thin_candidate", "query": query,
    })
    return rec
