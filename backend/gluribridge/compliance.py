"""
Compliance badges — read from the real Permenhut 6/2026 regulatory rules
table (data/regulatory/regulatory_rules.json), not hardcoded Python
constants. This used to encode ONLY Pasal 61 (R016) as literal dates/text
duplicated in this module; that's the bug this rewrite fixes. Dates, the
transitional window, and rule text now all come from the rules file itself
— if the file is updated, this module doesn't need a code change to follow.

The rules file was expanded from 19 to 25 entries (R020-R025, covering
Permenhut Pasal 18-23 / the DPP-international track) after this module was
first written — the loader reads the file fresh each process run, so no
code change was needed to pick up the new rows, but the new rule_ids
needed their own evaluability check rather than silently falling through
to a generic "not wired" message. Three rules are genuinely evaluable
against fields UnifiedCandidateRecord already has, so they're wired in:
  - R006 (Pasal 10): trading carbon requires an actual Unit Karbon, i.e. a
    SRUK registration — not just SRN-PPI (which registers the mitigation
    *action*, pre-Unit). registry_ids.sruk_registry_no vs
    registry_ids.srn_ppi_registry_no tests this directly.
  - R003 (Pasal 6(1)): defines the 5 legally-recognized Pelaku Usaha
    categories eligible to trade forest carbon. UnifiedCandidateRecord's
    land_rights_category field was built to hold exactly these 5 values
    (see schema.py), so testing membership is direct, not a guess.
  - R022 (Pasal 20): the DPP-track precondition — the international/Verra
    equivalent of R006's Unit Karbon precondition. dpp.registration_date
    tests this directly. NOTE: dpp itself (the dict) is set unconditionally
    for every Verra candidate by normalize_verra_record, so `dpp is not
    None` would be trivially true 100% of the time and isn't a real
    signal — dpp.registration_date is what actually varies (confirmed on
    real data: 516 of 1979 Verra candidates have one, 1463 don't), so
    that's the field this rule tests.

Every other rule in the file (R001/R002/R004/R005/R007-R015/R017-R021/
R023-R025) is listed in NOT_WIRED_REASONS with the specific reason it
isn't evaluated — most need either a submission/approval timestamp this
pipeline has no normalized field for, bind the Menteri/Kementerian
internally rather than an individual Pelaku Usaha, or (R024) bundle
multiple sub-conditions where only one is proxyable and presenting that
partial proxy as a full answer would overstate what's actually confirmed.
Per the project's own design principle ("when a check can't run, say so —
don't default to a negative result"), these are flagged explicitly rather
than silently skipped or faked.

Backward compatibility: evaluate_compliance()'s top-level return keys
(badge/rule_id/reason/deadline/days_until_deadline) are UNCHANGED in
meaning — they still describe R016's deadline-urgency signal specifically,
because scoring.py's N6 need-signal is written to mean "a compliance
deadline is looming," not general compliance status. Folding a
non-deadline eligibility badge (R003/R006) into that same top-level field
would silently change what N6 means without scoring.py's knowledge. The
newly-wired rules are additive instead: two new keys, `other_rules` and
`not_wired_rules`, carry them — existing callers (scoring.py, dossier.py,
export.py) that only read the original keys are unaffected.

Also still scoped to SRUK/SRN-PPI for R016/R006 specifically — Pasal 61 and
Pasal 10 are domestic-track provisions with no equivalent for the
international/Verra track (which runs through Pasal 20-23's separate DPP
process). A Verra-only candidate correctly returns 'not_applicable', not a
guessed badge.

Honest limitation, unchanged from before: R016 evaluates DEADLINE PROXIMITY
only, using registration date + stage as a proxy for "is this candidate in
scope." It has no visibility into whether a report was actually filed —
the pipeline has no field for that anywhere. AMBER/RED means "the clock
says this matters," not "we confirmed they're delinquent."
"""
import json
import os
from datetime import date, datetime
from functools import lru_cache
from .schema import UnifiedCandidateRecord

# Real Permenhut rules table, organized under data/regulatory/ per the
# project's data reorganization. Overridable via env var or the
# `rules_path` param (e.g. for tests using a different fixture file).
#
# "../.." is ONE level, not two, from this file's real location: this
# module lives at backend/gluribridge/compliance.py, so its parent's
# parent is backend/ (where data/ actually lives) — NOT the repo root.
# The "../.." here was correct before the 2026-08-27 backend/ reorg, when
# this file lived nested two levels deep (gluribridge/gluribridge/
# compliance.py) with data/ a sibling of the OUTER gluribridge/ directory.
# Flattening that nesting during the reorg silently broke this path — it
# still resolved to *some* existing directory (the repo root), just not
# the one with the actual regulatory_rules.json in it, so this failed
# closed (every rule showing not_applicable, one candidate at a time)
# rather than raising an import-time error a test would have caught.
# Confirmed real: found by chance computing a real aggregate compliance
# stat that came out as 0 across all 144 real candidates, when every
# earlier round this session had verified a real nonzero amber count.
DEFAULT_RULES_PATH = os.environ.get(
    "GLURIBRIDGE_REGULATORY_RULES_PATH",
    os.path.normpath(os.path.join(
        os.path.dirname(__file__), "..", "data", "regulatory", "regulatory_rules.json",
    )),
)

AMBER_WINDOW_DAYS = 60

VALID_PELAKU_USAHA_CATEGORIES = {"PBPH", "perhutanan_sosial", "hutan_adat", "hutan_hak", "PB_PJL_karbon"}

# Rules present in the real file that are NOT wired into evaluate_compliance,
# with the specific reason — see module docstring. Every rule_id in the
# loaded file that isn't a key in RULE_EVALUATORS should have an entry here
# so nothing is silently dropped.
NOT_WIRED_REASONS = {
    "R001": "Regulation citation/enactment metadata, not a per-candidate obligation.",
    "R002": "The regulation's own effective-date clause, not a per-candidate obligation.",
    "R004": "Pasal 6(2) requires legal-standing documentation specific to the Perhutanan Sosial/masyarakat hukum adat/hutan hak categories, beyond simple category membership (which R003 does check) — no such document field exists on UnifiedCandidateRecord.",
    "R005": "Pasal 9(1) scopes eligible trading to specific forest-area (kawasan) types; UnifiedCandidateRecord has no normalized kawasan-type field to test against.",
    "R007": "Pasal 11-14's 5+5-working-day DRAM review SLA needs the DRAM submission timestamp; the raw `dram` field is a source-schema passthrough with no guaranteed submission-date key across the known SRUK/SRN-PPI schema variants.",
    "R008": "Pasal 15-17's 14-working-day SPE GRK recommendation SLA needs the application submission date; not present as a normalized field.",
    "R009": "Internal Kementerian document-completeness process between officials — not observable from candidate-side data at all.",
    "R010": "Pasal 24's 6-month clock starts at Menteri approval issuance ('persetujuan terbit'), a distinct event from dpp.registration_date (Verra's own registration date) — treating them as the same date would misreport which event actually started the clock.",
    "R011": "Pasal 26(3)'s 7-working-day SLA needs the Corresponding Adjustment request date; not present as a normalized field.",
    "R012": "Pasal 28's safeguard-principle obligation needs safeguard/audit documentation UnifiedCandidateRecord doesn't capture.",
    "R013": "Pasal 41-45's independent LVV validation/verification requirement is specific to the domestic Unit Karbon (SRUK) track; there's no normalized 'validated by LVV' field distinct from the raw `dram` passthrough, and reusing Verra's own verra_status here would conflate the domestic and international tracks.",
    "R014": "Pasal 54's reporting obligation has no explicit frequency in the rule text itself ('frekuensi tidak disebutkan eksplisit') — nothing to test a specific date against.",
    "R015": "Pasal 55(4) binds the Menteri to run an annual review (pihak_terkait: 'Menteri') — never a per-candidate obligation.",
    "R017": "Pasal 63's roadmap deadline binds the Menteri, not individual Pelaku Usaha (pihak_terkait says so explicitly) — never applicable to a candidate.",
    "R018": "Repeal clause (revokes Permen LHK 7/2023) — not a per-candidate obligation.",
    "R019": "Transitional internal registry-operations procedure binding Kementerian Kehutanan internally, not candidates.",
    "R020": "Pasal 18 distinguishes SPE GRK recommendation (Menteri Kehutanan's authority) from final SPE GRK issuance (Menteri LH's authority) — two different ministries in one workflow. registration_stage is a single undifferentiated 1-5 progress integer with no field marking which ministry's action is pending.",
    "R021": "Pasal 19 classifies the BUYER/counterparty (compliance market vs voluntary market vs public) for a candidate that already holds SPE GRK — about the transaction's counterparty, not the candidate's own registration state. UnifiedCandidateRecord profiles project candidates, not trades, and has no buyer/counterparty field.",
    "R023": "Twin of R007 for the DPP track (Pasal 21's 5+5-working-day DPP review SLA) — same blocker as R007: needs the DPP submission timestamp, and `dpp` only carries registration_date/crediting_period dates/methodology (see normalize_verra.py), no submission-date field.",
    "R024": "Pasal 22 requires FOUR things together (independent DPP validation, implementation per DPP, independent achievement verification, and a verification report) to support a non-SPE GRK approval request. Verra's own validator/verra_units.issued are evidence from Verra's OWN international process (VCS), not Indonesia's Ministry-level Pasal 22 process — a plausibly-related but different jurisdiction's fact, not the same legal fact. That cross-jurisdiction gap is why this stays unscored here; dossier.py's dpp_validation_proxy surfaces it separately as unscored, hypothesis-tagged, dossier-only evidence (never a badge, never a scoring input) rather than losing the signal entirely.",
    "R025": "Twin of R008 for the DPP track (Pasal 23's 14-working-day document-completeness review) — same blocker as R008: needs the non-SPE GRK application submission date, not a normalized field. (Its resulting approval's validity period is governed by R010, already flagged for the same Menteri-approval-date gap.)",
}


@lru_cache(maxsize=4)
def _load_rules(path: str) -> dict:
    """Loads regulatory_rules.json once per path and indexes by rule_id."""
    with open(path, encoding="utf-8") as f:
        rules = json.load(f)
    return {r["rule_id"]: r for r in rules}


def _parse_date(value) -> date:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _rule_date(rule: dict, key: str) -> date:
    """Reads a date field out of a rule record (e.g. mulai_berlaku,
    deadline_absolut) — these come through as ISO strings or '-'/None."""
    return _parse_date(rule.get(key))


def _evaluate_r016(candidate: UnifiedCandidateRecord, rules: dict, reference_date: date) -> dict:
    rule = rules.get("R016")
    if rule is None:
        return {"badge": "not_applicable", "rule_id": "R016",
                "reason": "R016 (Pasal 61) not found in the loaded regulatory rules file.",
                "deadline": None, "days_until_deadline": None}

    deadline = _rule_date(rule, "deadline_absolut")
    # R016 itself doesn't repeat the regulation's effective date (confirmed
    # against the real file — its own mulai_berlaku is null); that date
    # lives once on R002/R001 (the regulation-wide metadata/effective-date
    # rules) and R016's transitional window depends on it, so fall back to
    # those rather than assuming every rule duplicates the field.
    effective_date = _rule_date(rule, "mulai_berlaku")
    if effective_date is None:
        for fallback_id in ("R002", "R001"):
            fallback_rule = rules.get(fallback_id)
            if fallback_rule:
                effective_date = _rule_date(fallback_rule, "mulai_berlaku")
                if effective_date:
                    break

    if effective_date is None or deadline is None:
        return {"badge": "not_applicable", "rule_id": "R016",
                "reason": "Pasal 61's effective date or deadline is missing/unparseable in the regulatory rules file.",
                "deadline": None, "days_until_deadline": None}

    is_domestic_registry = bool(
        candidate.registry_ids.get("sruk_registry_no") or candidate.registry_ids.get("srn_ppi_registry_no")
    )
    registered_at = _parse_date(candidate.registered_at)
    reached_qualifying_stage = (candidate.registration_stage or 0) >= 2 or candidate.dram is not None

    applicable = (
        is_domestic_registry
        and registered_at is not None
        and registered_at < effective_date
        and reached_qualifying_stage
    )

    if not applicable:
        reason = "Permenhut 6/2026 Pasal 61's transitional filing deadline does not apply"
        if not is_domestic_registry:
            reason += " — no SRUK/SRN-PPI registration (Pasal 61 doesn't cover the international/Verra track)."
        elif registered_at is None:
            reason += " — no registration date on file to test against."
        elif registered_at >= effective_date:
            reason += f" — registered {registered_at.isoformat()}, on/after the regulation's effective date."
        else:
            reason += " — has not yet reached a qualifying registration stage."
        return {"badge": "not_applicable", "rule_id": "R016", "reason": reason,
                "deadline": None, "days_until_deadline": None}

    days_left = (deadline - reference_date).days
    if days_left < 0:
        badge = "red"
        reason = (f"Registered {registered_at.isoformat()}, before the {effective_date.isoformat()} effective date — "
                   f"the Pasal 61 reporting deadline ({deadline.isoformat()}) has passed. "
                   f"NOT a confirmed filing failure — this pipeline has no field tracking whether a report was actually submitted.")
    elif days_left <= AMBER_WINDOW_DAYS:
        badge = "amber"
        reason = (f"Registered {registered_at.isoformat()}, before the {effective_date.isoformat()} effective date — "
                   f"the Pasal 61 reporting deadline ({deadline.isoformat()}) is {days_left} days away.")
    else:
        badge = "green"
        reason = (f"Registered {registered_at.isoformat()}, before the {effective_date.isoformat()} effective date — "
                   f"the Pasal 61 reporting deadline ({deadline.isoformat()}) is {days_left} days away, not yet urgent.")

    return {"badge": badge, "rule_id": "R016", "reason": reason,
            "deadline": deadline.isoformat(), "days_until_deadline": days_left}


def _evaluate_r006(candidate: UnifiedCandidateRecord, rules: dict, reference_date: date) -> dict:
    if "R006" not in rules:
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R006",
                "reason": "R006 (Pasal 10) not found in the loaded regulatory rules file.",
                "deadline": None, "days_until_deadline": None}
    has_verra = bool(candidate.registry_ids.get("verra_project_id"))
    has_sruk = bool(candidate.registry_ids.get("sruk_registry_no"))
    has_srn_ppi = bool(candidate.registry_ids.get("srn_ppi_registry_no"))

    if not has_sruk and not has_srn_ppi:
        if has_verra:
            reason = ("Pasal 10's Unit Karbon precondition governs the domestic SRUK track; "
                       "this candidate is on the international/Verra (DPP) track instead.")
        else:
            reason = "No SRUK or SRN-PPI registration on file to test Pasal 10 against."
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R006", "reason": reason,
                "deadline": None, "days_until_deadline": None}

    if has_sruk:
        return {"applicable": True, "badge": "green", "rule_id": "R006",
                "reason": "Registered a Unit Karbon via SRUK — Pasal 10's precondition for trading carbon is met.",
                "deadline": None, "days_until_deadline": None}

    return {"applicable": True, "badge": "amber", "rule_id": "R006",
            "reason": ("Registered an Aksi Mitigasi via SRN-PPI but has not yet been issued a Unit Karbon via "
                       "SRUK — per Pasal 10, carbon cannot be traded until that happens."),
            "deadline": None, "days_until_deadline": None}


def _evaluate_r003(candidate: UnifiedCandidateRecord, rules: dict, reference_date: date) -> dict:
    if "R003" not in rules:
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R003",
                "reason": "R003 (Pasal 6(1)) not found in the loaded regulatory rules file.",
                "deadline": None, "days_until_deadline": None}
    category = candidate.land_rights_category
    if not category:
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R003",
                "reason": ("No land_rights_category on file yet — Pasal 6(1) actor-category eligibility "
                           "not yet checked (this is 'not yet checked', not a confirmed gap)."),
                "deadline": None, "days_until_deadline": None}
    if category in VALID_PELAKU_USAHA_CATEGORIES:
        return {"applicable": True, "badge": "green", "rule_id": "R003",
                "reason": f"Land rights category '{category}' is one of Pasal 6(1)'s 5 recognized Pelaku Usaha categories eligible to trade forest carbon.",
                "deadline": None, "days_until_deadline": None}
    return {"applicable": True, "badge": "amber", "rule_id": "R003",
            "reason": f"Land rights category '{category}' does not match any of Pasal 6(1)'s 5 recognized Pelaku Usaha categories.",
            "deadline": None, "days_until_deadline": None}


def _evaluate_r022(candidate: UnifiedCandidateRecord, rules: dict, reference_date: date) -> dict:
    if "R022" not in rules:
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R022",
                "reason": "R022 (Pasal 20) not found in the loaded regulatory rules file.",
                "deadline": None, "days_until_deadline": None}
    has_verra = bool(candidate.registry_ids.get("verra_project_id"))
    if not has_verra:
        return {"applicable": False, "badge": "not_applicable", "rule_id": "R022",
                "reason": "Pasal 20's DPP precondition governs the international/Verra track; this candidate has no Verra registration to test it against.",
                "deadline": None, "days_until_deadline": None}

    dpp_registration_date = (candidate.dpp or {}).get("registration_date") if candidate.dpp else None
    if dpp_registration_date:
        return {"applicable": True, "badge": "green", "rule_id": "R022",
                "reason": f"DPP registered ({dpp_registration_date}) — Pasal 20(a)'s precondition for requesting non-SPE GRK approval is met.",
                "deadline": None, "days_until_deadline": None}

    return {"applicable": True, "badge": "amber", "rule_id": "R022",
            "reason": ("Verra/international-track candidate but no DPP registration date on file yet — per Pasal 20(a), "
                       "pencatatan DPP is the first-step precondition before requesting non-SPE GRK approval."),
            "deadline": None, "days_until_deadline": None}


# rule_id -> evaluator(candidate, rules, reference_date) -> result dict.
# Each evaluator receives the FULL rules dict (not just its own rule)
# because R016 needs to cross-reference R002/R001 for the regulation's
# effective date (see _evaluate_r016).
# R016 is the "primary" rule (drives the backward-compatible top-level
# return keys); the rest land in the additive `other_rules` list.
RULE_EVALUATORS = {
    "R016": _evaluate_r016,
    "R006": _evaluate_r006,
    "R003": _evaluate_r003,
    "R022": _evaluate_r022,
}


def evaluate_compliance(candidate: UnifiedCandidateRecord, reference_date: date = None,
                         rules_path: str = None) -> dict:
    reference_date = reference_date or date.today()
    path = rules_path or DEFAULT_RULES_PATH

    try:
        rules = _load_rules(path)
    except (OSError, json.JSONDecodeError) as e:
        # When the check can't run, say so — don't default to a negative
        # result (same principle as BRWA's "not yet checked").
        return {"badge": "not_applicable", "rule_id": "R016",
                "reason": f"Regulatory rules file could not be loaded ({path}): {e}",
                "deadline": None, "days_until_deadline": None,
                "other_rules": [], "not_wired_rules": []}

    other_rules = []
    primary = None
    for rule_id, evaluator in RULE_EVALUATORS.items():
        result = evaluator(candidate, rules, reference_date)
        if rule_id == "R016":
            primary = result
        else:
            other_rules.append(result)

    if primary is None:
        primary = {"badge": "not_applicable", "rule_id": "R016",
                   "reason": "R016 (Pasal 61) not found in the loaded regulatory rules file.",
                   "deadline": None, "days_until_deadline": None}

    not_wired = [
        {"rule_id": rule_id, "pasal": rule.get("pasal"), "reason": NOT_WIRED_REASONS.get(rule_id, "Not yet wired.")}
        for rule_id, rule in rules.items()
        if rule_id not in RULE_EVALUATORS
    ]

    primary["other_rules"] = other_rules
    primary["not_wired_rules"] = not_wired
    return primary
