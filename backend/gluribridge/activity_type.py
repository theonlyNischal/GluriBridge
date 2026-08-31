"""
Real-activity-type classification — a candidate can carry zero, one, or
several of 5 real categories (Peatland, Reforestation, Social forestry,
Conservation, Improved Forest Management), plus a separate "not
applicable" state distinct from an honest "we couldn't classify this."

Built 2026-08-31 after a real classification test against 43 real
candidate titles (25 SRUK/SRN-PPI + 18 Verra), reported in full in
PROJECT_CONTEXT.md — NOT built speculatively. Multi-tag is deliberate,
not a shortcut: 11 of 29 classifiable real titles in that test carried 2
or 3 real categories at once (e.g. "PLUM Peat and Mangrove Conservation
and Restoration Project" is genuinely Peatland + Conservation +
Reforestation all at once) — forcing a single primary type would have
been actively dishonest on over a third of real classifiable candidates.

Same "don't default to a negative result" principle as compliance.py and
BRWA land-rights evidence elsewhere in this codebase: a candidate with no
matched category is "unclassified" (this classifier's current keyword
list doesn't cover its title — a real, nameable coverage gap, not a
claim that no category applies), which is a DIFFERENT, distinct state
from "not applicable" (this candidate's real activity genuinely isn't a
forestry land-use type at all — confirmed via Verra's own
afolu_activities field, never guessed from title text). Blending these
two into one generic "Other" bucket would be a step backward from the
honesty pattern the rest of this app already follows.
"""
import re
from .schema import UnifiedCandidateRecord

CATEGORY_PEATLAND = "Peatland"
CATEGORY_REFORESTATION = "Reforestation"
CATEGORY_SOCIAL_FORESTRY = "Social forestry"
CATEGORY_CONSERVATION = "Conservation"
CATEGORY_IFM = "Improved Forest Management"

ALL_CATEGORIES = (
    CATEGORY_PEATLAND, CATEGORY_REFORESTATION, CATEGORY_SOCIAL_FORESTRY,
    CATEGORY_CONSERVATION, CATEGORY_IFM,
)

# Widened 2026-08-31 after the first real test found "tutupan hutan" and
# fire-patrol/deforestation-reduction language as real, rescuable misses —
# confirmed safe against all 144 real candidate names first, not just the
# 43-title test sample (see PROJECT_CONTEXT.md): "tutupan hutan" and
# "kebakaran hutan"/"patroli" each had exactly 1 real hit dataset-wide, and
# 4 of 5 real "deforestasi" occurrences already matched on an existing
# keyword regardless — so this widening rescues real misses without
# introducing new false positives on real data.
PEATLAND_KEYWORDS = ("gambut", "peat", "mangrove")
REFORESTATION_KEYWORDS = (
    "reforestasi", "restorasi", "restoration", "rehabilitasi lahan",
    "land rehabilitation", "revegetasi", "penanaman pohon", "tutupan hutan",
)
# Checked against the candidate's own NAME text.
SOCIAL_FORESTRY_NAME_KEYWORDS = (
    "perhutanan sosial", "hutan desa", "hutan rakyat",
    "hutan kemasyarakatan", "community forest", "pbph",
)
# Checked against the candidate's ORG name specifically — these are
# real Indonesian social-forestry farmer-group/village-institution
# acronyms that show up as an org's own name prefix (e.g. "KTH Giri
# Mulya", "LPHD Wana Mandiri"), not necessarily spelled out in the
# project title itself.
SOCIAL_FORESTRY_ORG_PREFIXES = ("kth ", "lphd ", "lmdh ")
CONSERVATION_KEYWORDS = ("konservasi", "conservation", "perlindungan", "pelestarian", "redd+")

# A bare "deforestasi" substring was deliberately NOT added as its own
# keyword — checked against all 144 real candidate names first: only 1 of
# 5 real hits was a genuine new rescue, the rest already matched an
# existing keyword, and a bare match risks a future candidate that merely
# *discusses* deforestation analytically without acting on it. Requiring
# it to co-occur with a real reduction-action word is the safer rule,
# confirmed sufficient for the one real case found.
_DEFORESTATION_ACTION_RE = re.compile(r"kebakaran hutan|patroli", re.IGNORECASE)
_DEFORESTATION_WORD_RE = re.compile(r"deforestasi", re.IGNORECASE)

# Real Verra afolu_activities codes that ARE forest-related (confirmed
# against this project's own real raw data, 2026-08-31: every one of the
# 45 real final Verra candidates except AgriCapture carries at least one
# of these). ALM (Agricultural Land Management) and ACoGS (Avoided
# Conversion of Grasslands and Shrublands) are real Verra AFOLU codes too
# — genuinely not forest activities, which is exactly the "not
# applicable" signal below.
FOREST_RELATED_AFOLU_CODES = {"ARR", "REDD", "IFM", "WRC"}


def _text_contains_any(text: str, keywords: tuple) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in keywords)


def _has_social_forestry_org_signal(org: str) -> bool:
    if not org:
        return False
    lowered = f"{org.strip().lower()} "  # trailing space so a bare prefix match still requires a word boundary
    return any(lowered.startswith(prefix) for prefix in SOCIAL_FORESTRY_ORG_PREFIXES)


def _has_conservation_fire_patrol_signal(name: str) -> bool:
    return bool(_DEFORESTATION_ACTION_RE.search(name) and _DEFORESTATION_WORD_RE.search(name))


def _verra_afolu_codes(candidate: UnifiedCandidateRecord) -> set:
    if not candidate.verra_afolu_activities:
        return set()
    return {c.strip().upper() for c in candidate.verra_afolu_activities.split(",") if c.strip()}


def _has_ifm_signal(candidate: UnifiedCandidateRecord) -> bool:
    # The real, primary signal: Verra's own activity-type code. Confirmed
    # more reliable than title text — "JATI DHARMA INDAH PLYWOOD
    # INDUSTRIES IFM PROJECT 1" is the only real title in this session's
    # test sample that spells "IFM" out, but the field-based check catches
    # every real IFM candidate regardless of title wording.
    if "IFM" in _verra_afolu_codes(candidate):
        return True
    # Defensive text fallback for sources with no afolu_activities field
    # at all (SRUK/SRN-PPI/news) — never the primary mechanism, just in
    # case a title happens to spell this out literally.
    name = (candidate.name or "")
    return "improved forest management" in name.lower() or bool(re.search(r"\bifm\b", name, re.IGNORECASE))


def _not_applicable(candidate: UnifiedCandidateRecord):
    """
    Real, structural detection, gated on the data actually being present —
    NOT on candidate.primary_source. A first draft gated this on
    `primary_source == "verra"`, then a bug caught while patching this
    classification onto the live 144-candidate dataset (2026-08-31) proved
    that's fragile: a candidate whose *identity* merged in from Verra can
    still carry a different primary_source string after resolve_candidates()
    picks a merge winner, or after later provenance entries (contact
    resolution, manual review) get appended to the same audit trail a
    naive read might mistake for identity-source history. Checking
    directly whether real verra_afolu_activities codes are present is
    simpler AND correct regardless of any of that — a non-Verra candidate
    (SRUK/SRN-PPI/news normalizers never populate this field at all) will
    always have codes == set() here, so the guard below already does the
    right thing without needing primary_source at all.

    SRUK/SRN-PPI have no equivalent field, and both of Indonesia's own
    domestic registries are inherently forestry-carbon-scoped, so there is
    no real basis to ever call a domestic-registry candidate "not
    applicable" — confirmed by construction, not by checking a source
    label. Never guessed from title text either — confirmed real,
    2026-08-31: of this project's own 45 real final Verra candidates, 44
    carry at least one forest-related afolu_activities code; exactly 1
    (AgriCapture Southeast Asia Rice Methane Project, methodology VM0051,
    a rice-paddy-irrigation methane-reduction project) carries only "ALM"
    with no forest code at all.
    """
    codes = _verra_afolu_codes(candidate)
    if not codes:
        return False, None
    if codes & FOREST_RELATED_AFOLU_CODES:
        return False, None
    return True, (
        f"Verra's own activity-type code for this project ({candidate.verra_afolu_activities}) "
        f"has no forest-related component (ARR/REDD/IFM/WRC) — the real underlying activity "
        f"isn't a forestry land-use type, not a gap in this classifier's keyword coverage."
    )


def classify_activity_type(candidate: UnifiedCandidateRecord) -> dict:
    """
    Returns {"categories": [...], "not_applicable": bool, "not_applicable_reason": str|None}.
    `categories` is always [] when not_applicable is True — the two
    states are mutually exclusive by construction, never both populated.
    An empty `categories` list with not_applicable=False means
    "unclassified": a real candidate this classifier's current keyword
    list (or, for Verra, activity-code list) doesn't cover — a distinct,
    nameable state, never silently folded into "not applicable" or a
    generic "Other."
    """
    not_applicable, reason = _not_applicable(candidate)
    if not_applicable:
        return {"categories": [], "not_applicable": True, "not_applicable_reason": reason}

    name = candidate.name or ""
    org = candidate.org or ""
    categories = []

    if _text_contains_any(name, PEATLAND_KEYWORDS):
        categories.append(CATEGORY_PEATLAND)
    if _text_contains_any(name, REFORESTATION_KEYWORDS):
        categories.append(CATEGORY_REFORESTATION)
    if _text_contains_any(name, SOCIAL_FORESTRY_NAME_KEYWORDS) or _has_social_forestry_org_signal(org):
        categories.append(CATEGORY_SOCIAL_FORESTRY)
    if _text_contains_any(name, CONSERVATION_KEYWORDS) or _has_conservation_fire_patrol_signal(name):
        categories.append(CATEGORY_CONSERVATION)
    if _has_ifm_signal(candidate):
        categories.append(CATEGORY_IFM)

    return {"categories": categories, "not_applicable": False, "not_applicable_reason": None}
