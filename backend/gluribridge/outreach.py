"""
Outreach email generation — pure template, no LLM, same design
philosophy as dossier.py (see its own module docstring). Reads only
from already-computed fields: the candidate's own registrant_contact,
and the dossier dict already built by build_dossier() (why_gluri,
suggested_poc, next_questions). Never invents a name, an email address,
or a claim not already present elsewhere in the pipeline's output.

Bilingual (EN/ID), deterministic, no LLM — same guarantee-exactness
requirement as the English hedging language itself. This reverses
earlier guidance that bilingual should wait for an LLM-polish layer;
that reasoning holds for dossier.py's internal-only text, but not for
outreach specifically, since a translation of the fact/hypothesis
hedging needs the same exactness guarantee as the original wording.

SCOPE BOUNDARY, stated explicitly rather than silently narrowed: only
outreach.py's own FIXED strings have real Indonesian twins — subject,
salutation (all 4 recipient_status cases), the company intro, sign-off,
and the fact/hypothesis hedging wrapper phrase. The DYNAMIC content
(why_gluri reason text, suggested_poc, next_questions) comes from
dossier.py, which has no Indonesian output anywhere in the system —
translating that dynamic, gap-derived prose is a materially bigger task
than twinning fixed strings and is NOT done here. The Indonesian half of
a generated email therefore wraps Indonesian scaffolding around English
claim text (e.g. "Berdasarkan temuan kami sejauh ini, tampaknya
[English hypothesis text]") — correct for what was asked, not a fully
Indonesian email. Giving dossier.py real Indonesian dynamic content
would be a natural follow-up, not scoped in here.

Every generated email carries BOTH languages by default — English
first, then Indonesian below a labeled divider — matching real
Indonesian business correspondence norms and letting Gluri's own team
review the English half without translating. subject_en/subject_id and
body_en/body_id are also exposed individually alongside the combined
subject/body, for a future consumer that wants just one language
without re-splitting the combined string.

Fact vs. hypothesis discipline matters MORE here than anywhere else in
the pipeline: this is the one output a real person outside Gluri
actually reads. A fact-tagged why_gluri reason is stated plainly; a
hypothesis-tagged one is hedged in the email's own language ("it
appears that..." / "tampaknya...") in BOTH languages independently —
never presented to an external recipient as confirmed when the
pipeline itself only holds it as inferred.

Warnings (manual-lookup needed, generic-salutation notice, the
insufficient-contact refusal) stay English-only on purpose: they are
internal tooling notes for whoever reviews the draft before sending,
never part of the email content itself, so there's nothing recipient-
facing to twin.

Confirmed on the real 128 registry candidates (2026-08-27), not assumed
from a handful of examples: EVERY Tier A contact (sruk_registrant /
srn_ppi_registrant, 83 of 128) has a real name and email=None; EVERY
Tier B contact (org_website, 1 of 128) has a real email and name=None.
That's why generate_outreach() branches on name/email presence rather
than on contact_source/tier label — it's the actual, verified shape of
the data, and it degrades correctly if a future tier (Tier C, or a
Tier A record that someday also carries an email) ever has both.
"""
from .schema import UnifiedCandidateRecord

# Fixed boilerplate, not per-candidate data — written once each. Sourced
# from PROJECT_CONTEXT.md Section 1 (Gluri's own description of itself),
# not invented: a Busan-based startup with a satellite+AI forest-carbon
# dMRV product called treXchange.
COMPANY_INTRO_EN = (
    "Gluri operates treXchange, a satellite- and AI-based monitoring, reporting, and "
    "verification (dMRV) platform for forest-carbon projects. We're reaching out to "
    "organizations across Indonesia's forestry-carbon sector to explore whether treXchange "
    "could support your project's measurement and verification needs alongside your existing "
    "registry process."
)
COMPANY_INTRO_ID = (
    "Gluri mengoperasikan treXchange, sebuah platform pemantauan, pelaporan, dan verifikasi "
    "(dMRV) berbasis satelit dan AI untuk proyek karbon hutan. Kami menghubungi berbagai "
    "organisasi di sektor karbon kehutanan Indonesia untuk menjajaki apakah treXchange dapat "
    "mendukung kebutuhan pengukuran dan verifikasi proyek Anda, sejalan dengan proses "
    "registrasi yang sudah berjalan."
)

SIGN_OFF_EN = "Best regards,\nThe Gluri team"
SIGN_OFF_ID = "Salam hormat,\nTim Gluri"

SUBJECT_PREFIX_EN = "Partnership inquiry"
SUBJECT_PREFIX_ID = "Penjajakan Kemitraan"

# The hedging wrapper is the highest-stakes twin in this module — it must
# land with equivalent hedging weight, not a literal dictionary swap.
# "tampaknya" ("it appears/seems") is the standard formal-register hedge
# word in Indonesian business correspondence, matching "it appears that"
# in both meaning and register (as opposed to the more casual "sepertinya").
HEDGE_PREFIX_EN = "Based on what we've found so far, it appears that"
HEDGE_PREFIX_ID = "Berdasarkan temuan kami sejauh ini, tampaknya"

BILINGUAL_DIVIDER = (
    "\n\n-----\n"
    "Versi Bahasa Indonesia / Indonesian version below\n"
    "-----\n\n"
)


def _recipient_status(candidate: UnifiedCandidateRecord) -> str:
    """
    'ready'                -> named contact AND email both on file (not
                               observed on real data yet, but handled
                               correctly if it ever occurs).
    'name_only_no_email'   -> Tier A shape: real name, no email.
    'email_only_no_name'   -> Tier B shape: real email, no name.
    'insufficient_contact' -> no contact_source resolved at all, or a
                               contact_source with neither a name nor an
                               email (shouldn't happen on real data, but
                               a genuinely unusable contact must still
                               refuse to generate, not guess).
    """
    contact = candidate.registrant_contact
    if not contact or not contact.contact_source:
        return "insufficient_contact"
    has_name = bool(contact.name)
    has_email = bool(contact.email)
    if has_name and has_email:
        return "ready"
    if has_name:
        return "name_only_no_email"
    if has_email:
        return "email_only_no_name"
    return "insufficient_contact"


def _salutation(candidate: UnifiedCandidateRecord, status: str, lang: str):
    contact = candidate.registrant_contact
    if status in ("ready", "name_only_no_email"):
        return f"Dear {contact.name}," if lang == "en" else f"Yth. {contact.name},"
    if status == "email_only_no_name":
        org = candidate.org or "team"
        return f"Dear {org}," if lang == "en" else f"Yth. Tim {org},"
    return None


def _opening_paragraph(why_gluri: list, lang: str) -> str:
    """
    References the specific real gap(s)/status this candidate was
    surfaced for — the actual why_gluri reasons already computed by
    build_dossier(), never re-derived here (and never translated here —
    see module docstring's scope boundary). Fact-tagged reasons are
    stated plainly in both languages (they're already complete, real
    sentences, no wrapper to twin); a hypothesis-tagged reason gets the
    hedge wrapper in the requested language, wrapped around the same
    (English) claim text either way.
    """
    hedge_prefix = HEDGE_PREFIX_EN if lang == "en" else HEDGE_PREFIX_ID
    sentences = []
    for item in why_gluri:
        text = item["text"]
        if item["evidence_level"] == "fact":
            sentences.append(text)
        else:
            lowered = (text[0].lower() + text[1:]) if text else text
            sentences.append(f"{hedge_prefix} {lowered}")
    return " ".join(sentences)


def _discovery_questions_block(next_questions: list, lang: str) -> str:
    """
    2-3 of the dossier's own next_questions, framed as discovery
    questions for a first call rather than an interrogation list — the
    questions themselves are never re-derived or translated here, only
    re-framed with a language-appropriate lead-in sentence.
    """
    qs = (next_questions or [])[:3]
    if not qs:
        return ""
    framed = "\n".join(f"- {q}" for q in qs)
    lead_in = ("A few things it'd help us understand on an initial call:" if lang == "en"
               else "Beberapa hal yang ingin kami pahami dalam panggilan awal:")
    return lead_in + "\n" + framed


def _build_body(candidate, dossier, status, lang: str) -> str:
    salutation = _salutation(candidate, status, lang)
    opening = _opening_paragraph(dossier["why_gluri"], lang)
    pitch = dossier["suggested_poc"]  # dynamic, English-only — see scope boundary above
    discovery_block = _discovery_questions_block(dossier.get("next_questions"), lang)
    intro = COMPANY_INTRO_EN if lang == "en" else COMPANY_INTRO_ID
    sign_off = SIGN_OFF_EN if lang == "en" else SIGN_OFF_ID

    parts = [salutation, "", opening, "", intro, "", pitch]
    if discovery_block:
        parts += ["", discovery_block]
    parts += ["", sign_off]
    return "\n".join(parts)


def generate_outreach(candidate: UnifiedCandidateRecord, dossier: dict) -> dict:
    """
    Returns a structured dict:
      {candidate_id, recipient_status, subject, subject_en, subject_id,
       body, body_en, body_id, to, warnings}
    Mirrors build_dossier()'s pattern — pure assembly of already-computed
    fields. Nothing is computed here that isn't already on the candidate
    or in the dossier dict passed in, plus the fixed Indonesian twins
    defined in this module. Never fabricates a recipient: case 3
    (insufficient_contact) returns no subject/body/to at all in either
    language, only an explanation, matching build_dossier()'s own
    honesty pattern for thin candidates ("not enough is known yet...").
    """
    status = _recipient_status(candidate)
    contact = candidate.registrant_contact

    if status == "insufficient_contact":
        return {
            "candidate_id": candidate.candidate_id,
            "recipient_status": status,
            "subject": None, "subject_en": None, "subject_id": None,
            "body": None, "body_en": None, "body_id": None,
            "to": None,
            "warnings": [
                "Insufficient contact information — outreach cannot be generated until a "
                "contact is resolved. No named individual and no email address on file for "
                "this candidate."
            ],
        }

    warnings = []
    if status == "name_only_no_email":
        # Distinguishes "never searched for an email" from "searched and
        # found nothing" (2026-08-31 audit trail) — same wording pattern as
        # ContactReadinessIndicator and the Key Gaps sidebar's Contact
        # readiness line.
        if contact.contact_tier_b_attempted_at:
            warnings.append(
                f"Recipient email address not on file for {contact.name} — a web search did "
                f"not find a public email; manual lookup would need a different channel "
                f"(e.g. contacting the organization directly)."
            )
        else:
            warnings.append(
                f"Recipient email address not on file for {contact.name} — needs manual lookup "
                f"before this can actually be sent."
            )
    if status == "email_only_no_name":
        warnings.append(
            "No named individual on file for this contact — addressed generically to the "
            "organization. Confirm a specific recipient if possible before sending."
        )

    org_or_name = candidate.org or candidate.name
    subject_en = f"{SUBJECT_PREFIX_EN} — {org_or_name}"
    subject_id = f"{SUBJECT_PREFIX_ID} — {org_or_name}"

    body_en = _build_body(candidate, dossier, status, "en")
    body_id = _build_body(candidate, dossier, status, "id")

    return {
        "candidate_id": candidate.candidate_id,
        "recipient_status": status,
        "subject": f"{subject_en} / {subject_id}",
        "subject_en": subject_en,
        "subject_id": subject_id,
        "body": body_en + BILINGUAL_DIVIDER + body_id,
        "body_en": body_en,
        "body_id": body_id,
        "to": contact.email if status in ("ready", "email_only_no_name") else None,
        "warnings": warnings,
    }


def render_outreach_text(outreach: dict) -> str:
    """
    Plain text, ready to paste into an email client — English first,
    then Indonesian below a labeled divider. For insufficient_contact,
    returns the plain explanation instead of a fake-looking email —
    never pads out a header block around nothing.
    """
    if outreach["recipient_status"] == "insufficient_contact":
        return outreach["warnings"][0]

    lines = []
    for w in outreach["warnings"]:
        lines.append(f"[!] {w}")
    if outreach["warnings"]:
        lines.append("")
    lines.append(f"To: {outreach['to'] or '(recipient email not on file — see warning above)'}")
    lines.append(f"Subject: {outreach['subject']}")
    lines.append("")
    lines.append(outreach["body"])
    return "\n".join(lines)
