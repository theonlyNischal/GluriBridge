"""
Tier B contact resolution: search for the organization's own website and
extract an email from it. Only worth running for candidates that don't
already have a Tier A contact (SRUK/SRN-PPI registrant) — costs a real
Tavily search credit, no reason to spend it where Tier A already resolved
the question for free.
"""
import re
from rapidfuzz import fuzz
from .match import strip_legal, _is_generic_org

# Domains that might rank highly for an org-name search but are never the
# org's OWN site — excluding these is what stops Tier B from mistaking a
# news mention or a directory listing for the organization's real contact
# page.
NON_ORG_DOMAINS = {
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
    "wikipedia.org", "youtube.com", "srukindonesia.kemenlh.go.id",
    "brwa.id", "registry.verra.org", "bing.com", "google.com",
    # major Indonesian/international news outlets — a fuzzy domain match
    # against these should never win purely by coincidence. NOTE: this is
    # a specific blocklist, not a general "is this a news site" classifier
    # — any real news domain not on this list can still slip through if it
    # happens to fuzzy-match the org slug and has an unrelated email on the
    # page. Confirmed gap during testing, not fully closed here.
    "detik.com", "kompas.com", "antaranews.com", "tempo.co", "cnbcindonesia.com",
    "mongabay.co.id", "reuters.com", "bloomberg.com", "cnn.com", "bbc.com",
}

# Defense-in-depth floor on domain_match_score, enforced BEFORE content-
# checking runs at all — not just a sort key (that was the actual gap: a
# result could win purely on content self-identification regardless of how
# unrelated its domain looked). Set from real evidence, not a guess, and
# deliberately low — the real data proved domain_score alone CANNOT
# reliably separate correct from incorrect matches:
#   InfiniteEARTH (confirmed correct):            domain_score 100.00
#   PT RMU -> rmu.edu (acronym collision, wrong):  domain_score 100.00
#   YAKOPI (confirmed correct):                    domain_score  41.67
#   nature.org case (unrelated NGO, wrong):        domain_score  41.67
#   Hong Kong Fine Technology -> federalregister.gov (confirmed wrong): 34.15
# The two confirmed-correct cases and two wrong/likely-wrong cases have
# IDENTICAL scores in both pairs — no threshold can cleanly separate them.
# This floor is set just above the one clearly-degenerate case (34.15) as a
# cheap sanity filter for domains with essentially nothing in common with
# the org name; it is NOT the real defense (Signal 2's org-proximity check
# in _self_identifies_as is) and must not be relied on as one.
DOMAIN_SCORE_FLOOR = 35

# Cheap first-pass filter for obviously-unfilled website-template emails —
# a real bug, found on real data (2026-08-26): "PT Kandelia Alam" resolved
# to "info@your-domain.com", a literal placeholder never replaced by the
# site owner. This blocklist is NOT the real defense on its own (it can
# never be complete) — _email_domain_relates_to_site below is; this just
# catches the most common cases for free before that check even runs.
PLACEHOLDER_EMAIL_DOMAINS = {
    "your-domain.com", "yourdomain.com", "yoursite.com",
    "example.com", "example.org", "test.com", "sample.com",
}

# Below this, an org's core distinguishing slug is too short for Signal 2
# (first-person proximity) to safely discriminate — confirmed on real data:
# "PT RMU" (slug "rmu", 3 chars) collided with Robert Morris University's
# own genuine self-identification, and "PT Carbon" (slug "carbon", 6
# chars, right at the boundary) collided with an unrelated "Carbon Creek
# PT" site purely because "carbon" is a common word in this whole domain.
# Signal 1 (copyright footer) has stayed robust throughout every case this
# session because it requires the FULL org slug in a tight, structured
# location (the copyright line) — for short slugs it's the only signal
# kept enabled; Signal 2 and the title-label signal are both skipped
# entirely (not just discounted) rather than resolution being disabled
# altogether for these orgs.
SHORT_SLUG_THRESHOLD = 7  # inclusive floor via len() < this — must cover "carbon"
                           # (6 chars, the real "PT Carbon" collision) as well as
                           # "rmu" (3 chars), so the boundary is 7, not 6.


SELF_IDENTIFY_PATTERNS = [
    r"tentang kami", r"kami adalah", r"perusahaan kami", r"hubungi kami",
    r"about us", r"we are", r"our company", r"contact us",
]
THIRD_PARTY_NARRATIVE_MARKERS = [
    r"mengumumkan", r"menurut", r"dilansir", r"melaporkan", r"kata juru bicara",
    r"announced", r"reported", r"according to", r"spokesperson",
]

# Real bug, found on real data (2026-08-26, Stage 3 of the first live Tavily
# run): Signal 2 used to accept a self-referential phrase ANYWHERE on the
# page, with no check that the "us"/"we" actually referred to the org being
# searched for. A US Federal Register notice about export-control entity-
# list additions has its OWN generic "Contact Us" boilerplate — which has
# nothing to do with the Indonesian company it merely named in a list —
# and that was enough to pass, resolving the candidate's contact to a US
# government agency's email. Confirmed the same failure mode elsewhere
# too: "PT RMU" -> rmu.edu (Robert Morris University, an acronym
# collision) and a candidate's own org -> nature.org (a real but unrelated
# NGO's own genuine self-identification).
#
# Fix: require the org's own slug to appear WITHIN a window around the
# self-referential phrase, exactly mirroring Signal 1's discipline (which
# already correctly requires org_slug IN the copyright line, not just
# present somewhere on the page) rather than a weaker, unscoped check.
SELF_ID_PROXIMITY_WINDOW = 200  # characters on each side of the matched phrase


TITLE_SEGMENT_MIN_ORG_FRACTION = 0.7  # within its OWN segment, the org name must
                                        # be most of it — allows minor suffix noise
                                        # ("(YHLN)") without allowing a full sentence.


def _title_self_identifies(title: str, org: str) -> bool:
    """
    A title only counts as self-identification if the org name occupies a
    WHOLE separator-delimited segment of it — 'Kontak - Yayasan X', 'X |
    About Us' — not merely appearing somewhere within a longer sentence.
    That structural pattern (org name as its own segment) is what a real
    identity-label title has and a narrative headline essentially never
    does, so no curated keyword whitelist is needed for the OTHER segment.

    Two real bugs found fixing this, in order:
    1. First version blended title into the same text as content for one
       combined proximity search — broke on a real case (2026-08-26): a
       CERTIFICATION BODY's own announcement page titled "Pengumuman ...
       Pada PBPH PT Samudera Rejeki Perkasa Kabupaten Murung Raya..." put
       the target org's name in a long narrative title near the page's
       OWN "Hubungi Kami" boilerplate (which is really the certification
       body's own contact info, confirmed by its footer naming a
       different org entirely) — wrongly counted as self-ID once blended.
    2. Second version (title checked separately, but only requiring the
       org name be a large character-FRACTION of the whole title) still
       let a real adversarial test case through: "Hutan Rakyat Mandiri
       Terima Dana Hibah dari Pemerintah" (a news headline with no label
       separator at all) has the org name as ~40% of its characters
       simply by being the grammatical subject of a short sentence.
    Requiring an explicit separator AND a full matching segment closes
    both: neither bad title has a "-"/"|"/":" segment that IS the org name.
    """
    if not title:
        return False
    org_slug = _slugify(org)
    if not org_slug:
        return False
    segments = re.split(r"\s*[-|:]\s*", title)
    if len(segments) < 2:
        return False  # no label separator at all — a narrative headline, not a label title
    for segment in segments:
        segment_slug = re.sub(r"[^a-z0-9]", "", segment.lower())
        if segment_slug and org_slug in segment_slug and len(org_slug) / len(segment_slug) >= TITLE_SEGMENT_MIN_ORG_FRACTION:
            return True
    return False


def _self_identifies_as(text: str, org: str, title: str = "") -> dict:
    """
    Checks whether the page CONTENT self-identifies as the organization,
    rather than trusting the domain string alone. This is the actual fix
    for the blocklist problem: a blocklist can never be complete (any
    unlisted news domain slips through), but a real news site's own page
    almost never accidentally satisfies this — its copyright footer names
    the news outlet, not the company it's reporting on, and its language
    describes the org in third person, not first person.

    title and text are checked SEPARATELY, deliberately — see
    _title_self_identifies's docstring for why blending them into one
    proximity-window search (an earlier version of this fix) was itself a
    real bug: a long narrative title naming the org as its SUBJECT could
    fall within window range of a third party's OWN "contact us"
    boilerplate elsewhere on the page, wrongly counting as self-ID.
    """
    org_slug = _slugify(org)
    text_lower = text.lower()

    # Signal 1: copyright footer naming the org specifically — very hard
    # for an unrelated site to produce by coincidence.
    copyright_matches = re.findall(r"©\s*\d{4}[^\n]{0,80}", text)
    copyright_self_id = any(org_slug in re.sub(r"[^a-z0-9]", "", m.lower()) for m in copyright_matches)
    if copyright_self_id:
        return {"self_identifies": True, "confidence": "high", "signal": "copyright_footer"}

    # Below SHORT_SLUG_THRESHOLD, only Signal 1 (just checked, and it
    # didn't match) is trusted — see the constant's own comment. Signal 1b
    # and Signal 2 are both skipped entirely for short slugs, not just
    # discounted, because a short slug is exactly what let both of them
    # produce a real false positive on real data this session.
    if len(org_slug) < SHORT_SLUG_THRESHOLD:
        return {"self_identifies": False, "confidence": None,
                "signal": "org_slug_too_short_for_weaker_signals"}

    # Signal 1b: a genuine identity-label title (see _title_self_identifies).
    if _title_self_identifies(title, org):
        return {"self_identifies": True, "confidence": "medium", "signal": "identity_label_title"}

    # Signal 3 (negative): third-party narrative markers — a strong hint
    # this is reporting ABOUT the org, not the org's own page.
    third_party_present = any(re.search(p, text_lower) for p in THIRD_PARTY_NARRATIVE_MARKERS)

    # Signal 2, fixed: a self-referential phrase only counts if the org's
    # own slug appears within SELF_ID_PROXIMITY_WINDOW characters of it,
    # WITHIN CONTENT ONLY (never blended with title — see above) — exact
    # substring, same discipline as Signal 1, not a looser fuzzy match
    # (fuzzy matching is exactly what made domain-name scoring unreliable
    # — see find_org_website_contact's DOMAIN_SCORE_FLOOR comment for the
    # real-data evidence). Only reachable for org_slug >= SHORT_SLUG_THRESHOLD
    # — short/abbreviated slugs are gated out above, since that's exactly
    # what let this signal collide with an unrelated org sharing the same
    # short name/acronym on real data.
    if org_slug:
        for pattern in SELF_IDENTIFY_PATTERNS:
            for m in re.finditer(pattern, text_lower):
                start = max(0, m.start() - SELF_ID_PROXIMITY_WINDOW)
                end = min(len(text_lower), m.end() + SELF_ID_PROXIMITY_WINDOW)
                window_slug = re.sub(r"[^a-z0-9]", "", text_lower[start:end])
                if org_slug in window_slug and not third_party_present:
                    return {"self_identifies": True, "confidence": "medium",
                            "signal": "first_person_language_near_org_name"}

    return {"self_identifies": False, "confidence": None,
            "signal": "third_party_narrative_detected" if third_party_present else "no_self_identifying_signal"}


def _slugify(org: str) -> str:
    return re.sub(r"[^a-z0-9]", "", strip_legal(org).lower())


# Real small orgs/NGOs routinely use a free email provider for their public
# contact address instead of a custom-domain one — confirmed on real,
# already-verified-correct data: InfiniteEARTH's genuine contact is
# "infiniteearthpulsar@gmail.com" on theinfiniteearth.com, domains that
# obviously don't "relate" by any domain-matching rule. The actual risk
# pattern in every real bad case this session was an email belonging to a
# DIFFERENT SPECIFIC BUSINESS/AGENCY domain (bis.doc.gov, alamtri.com) or an
# unfilled template (your-domain.com) — not a generic consumer mail host.
# Exempting these from the relatedness requirement, not from the
# placeholder blocklist (a placeholder domain is never one of these anyway).
FREE_EMAIL_PROVIDERS = {
    "gmail.com", "yahoo.com", "yahoo.co.id", "outlook.com", "hotmail.com",
    "icloud.com", "protonmail.com", "live.com", "ymail.com",
}


def _email_domain_relates_to_site(email_domain: str, site_domain: str) -> bool:
    """
    True if the email's domain IS the site's domain, is a subdomain of it
    (or vice versa), or is a known free consumer email provider (see
    FREE_EMAIL_PROVIDERS). False for an email domain that belongs to some
    OTHER specific, unrelated organization/agency, or an unfilled website
    template — that's the actual property that made "info@your-domain.com"
    and the earlier Hong Kong/federal-register case wrong, and generalizes
    better than a blocklist could (a blocklist can only ever catch known
    placeholder domains; this catches any email with nothing to do with
    the page it was found on).
    """
    email_domain = re.sub(r"^www\.", "", email_domain.lower())
    site_domain = re.sub(r"^www\.", "", site_domain.lower())
    if not email_domain or not site_domain:
        return False
    if email_domain in FREE_EMAIL_PROVIDERS:
        return True
    return (email_domain == site_domain
            or email_domain.endswith("." + site_domain)
            or site_domain.endswith("." + email_domain))


def find_org_website_contact(org: str, tavily_client, max_results: int = 5) -> dict:
    """
    Returns {"found": bool, "email": ..., "url": ..., "reason": ...}.
    'found: False' with a reason is a normal, expected outcome — most
    candidates will legitimately not have an extractable contact this way —
    not something callers should treat as an error to surface.
    """
    if _is_generic_org(org):
        return {"found": False, "email": None, "url": None,
                "reason": "generic/placeholder org name, nothing to search for"}

    try:
        response = tavily_client.search(f'"{org}" kontak OR contact OR email', max_results=max_results)
    except Exception as e:
        return {"found": False, "email": None, "url": None, "reason": f"search failed: {e}"}

    org_slug = _slugify(org)
    candidates = []
    for r in response.get("results", []):
        url = r.get("url", "")
        domain = re.sub(r"^https?://(www\.)?", "", url).split("/")[0].lower()
        if any(bad in domain for bad in NON_ORG_DOMAINS):
            continue
        domain_slug = re.sub(r"[^a-z0-9]", "", domain)
        domain_match_score = fuzz.partial_ratio(org_slug, domain_slug)
        if domain_match_score < DOMAIN_SCORE_FLOOR:
            continue  # enforced BEFORE content-checking even runs — see the floor's own comment for why it's set this low
        candidates.append((domain_match_score, r))

    if not candidates:
        return {"found": False, "email": None, "url": None,
                "reason": "no non-excluded domain found in search results"}

    candidates.sort(key=lambda c: -c[0])

    # Check candidates in domain-match order, but require content
    # self-identification to actually accept one — domain match alone is
    # no longer sufficient (that was the actual gap). This also means a
    # LOWER domain-match candidate that genuinely self-identifies can win
    # over a higher domain-match one that turns out to be third-party
    # content — checking content, not just ranking by string similarity.
    for domain_score, result in candidates:
        text = result.get("raw_content") or result.get("content") or ""
        # Title is real, curated Tavily metadata (a page's own <title> tag)
        # and commonly names the org explicitly even when a short content
        # snippet doesn't — confirmed on real data (a "Kontak - Yayasan..."
        # title) and on this module's own adversarial test fixture, which
        # never fed title into self-identification at all before this.
        # Passed SEPARATELY from text, not blended — see
        # _self_identifies_as's docstring for the real bug that caused.
        identity_check = _self_identifies_as(text, org, title=result.get("title", ""))
        if not identity_check["self_identifies"]:
            continue

        emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
        if not emails:
            continue

        # Reject emails whose domain has nothing to do with the site they
        # were found on — see _email_domain_relates_to_site's docstring.
        # Cheap blocklist first (catches known unfilled-template domains
        # for free), then the general relatedness check (the real defense
        # — generalizes to placeholder/unrelated domains a blocklist was
        # never going to enumerate).
        site_domain = re.sub(r"^https?://(www\.)?", "", result.get("url", "")).split("/")[0].lower()
        valid_emails = [
            e for e in emails
            if e.split("@", 1)[1].lower() not in PLACEHOLDER_EMAIL_DOMAINS
            and _email_domain_relates_to_site(e.split("@", 1)[1], site_domain)
        ]
        if not valid_emails:
            continue

        return {"found": True, "email": valid_emails[0], "url": result.get("url"),
                "domain_match_score": domain_score, "confidence": identity_check["confidence"],
                "self_identify_signal": identity_check["signal"], "reason": None}

    return {"found": False, "email": None, "url": candidates[0][1].get("url"),
            "reason": "no candidate both self-identified as the organization AND had an extractable email"}


def resolve_contact_tier_b(candidate, tavily_client) -> bool:
    """
    Mutates candidate.registrant_contact in place if Tier B finds something.
    Returns True if it changed anything. Skips candidates that already have
    a Tier A contact — see module docstring.
    """
    existing_source = candidate.registrant_contact.contact_source if candidate.registrant_contact else None
    if existing_source and "registrant" in existing_source:
        return False  # Tier A already resolved this — don't spend a search credit

    if not candidate.org:
        return False

    result = find_org_website_contact(candidate.org, tavily_client)
    if not result["found"]:
        return False

    candidate.registrant_contact.contact_source = "org_website"
    candidate.registrant_contact.email = result["email"]
    candidate.registrant_contact.contact_source_url = result["url"]
    candidate.registrant_contact.contact_confidence = result["confidence"]
    candidate.field_sources["registrant_contact"] = {
        "source": "tavily_org_website", "source_tier": 3, "retrieved_at": None,
    }
    # store the resolved email/url on the record's evidence trail
    candidate.merged_from.append({
        "source": "tavily_contact_lookup", "source_id": result["url"],
        "match_status": "tier_b_contact_resolved", "email": result["email"],
    })
    return True
