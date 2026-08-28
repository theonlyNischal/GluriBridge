import os, sys, glob
sys.path.insert(0, "..")

from gluribridge.pipeline import run_pipeline
from gluribridge.compliance import evaluate_compliance, DEFAULT_RULES_PATH
from gluribridge.export import detail_view

# Guards against the exact bug found 2026-08-27 (PROJECT_CONTEXT.md Section 6):
# compliance.py's regulatory-rules-file path broke silently during the
# backend/ reorg, so evaluate_compliance() failed CLOSED — every candidate
# silently got badge=not_applicable with the real cause buried in a `reason`
# string, rather than an exception. No test anywhere exercised this module's
# output at all, so a fully green 13/13 suite hid the bug for the entire
# post-reorg period. This file exists specifically to close that gap, not to
# be a general compliance.py test suite.

# --- Guard 1: the rules file the module will actually load must exist and
# parse, checked directly rather than only inferred from downstream badges
# (a badge-only check couldn't distinguish "genuinely not applicable" from
# "the file silently failed to load and everything defaults to
# not_applicable" — which is exactly how this bug hid before).
assert os.path.exists(DEFAULT_RULES_PATH), (
    f"regulatory_rules.json not found at {DEFAULT_RULES_PATH} — if this path "
    "changed, evaluate_compliance() is failing closed RIGHT NOW, silently, "
    "for every candidate. See PROJECT_CONTEXT.md Section 6.")

# --- Guard 2: on real data, at least one real candidate must land on a
# non-default R016 badge (amber or red) — a dataset-wide default-only result
# is exactly the fail-closed symptom, not a plausible real outcome (confirmed
# on real data: 53 of 128 registry candidates are genuinely amber). ---
DATA_RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "raw")
sruk_srn = sorted(glob.glob(f"{DATA_RAW}/sruk/raw_details/*.json")) + sorted(glob.glob(f"{DATA_RAW}/srn_ppi/raw_details/*.json"))
run_dirs = sorted(glob.glob(f"{DATA_RAW}/verra/runs/*"))
verra_files = sorted(glob.glob(f"{run_dirs[-1]}/projects/*.json")) if run_dirs else []

result = run_pipeline(
    sruk_files=sruk_srn, verra_files=verra_files,
    brwa_list_path=f"{DATA_RAW}/brwa_profiles/wa_list.json",
    brwa_geojson_dir=f"{DATA_RAW}/brwa_geojson/geojson",
    brwa_profile_dir=f"{DATA_RAW}/brwa_profiles/profiles",
)

badges = {}
for c in result.candidates:
    compliance = evaluate_compliance(c)
    badges.setdefault(compliance["badge"], []).append((c.name, compliance["reason"]))
    assert "could not be loaded" not in compliance["reason"], (
        f"{c.name!r} got the rules-file-load-failure reason text — the file "
        f"is failing to load again: {compliance['reason']}")

non_default = badges.get("amber", []) + badges.get("red", [])
assert non_default, (
    "every real registry candidate landed on a default/not_applicable R016 "
    "badge — on real data this pipeline has always had a genuine amber "
    "population (53 of 128 confirmed 2026-08-27); an all-default result "
    "means evaluate_compliance() is failing closed again, not that the real "
    "population changed to zero.")

print(f"badge distribution: {[(k, len(v)) for k, v in badges.items()]}")
print(f"sample non-default case: {non_default[0][0]} — {non_default[0][1][:150]}")

# --- Guard 3: the same check at the detail_view() layer scoring.py/export.py
# actually serve, not just evaluate_compliance() called directly — confirms
# the fix is wired all the way through the real export path, not just the
# module in isolation. ---
sample = result.candidates[0]
dv = detail_view(sample)
assert "compliance" in dv["scoring"], "detail_view() must expose a compliance block"
assert dv["scoring"]["compliance"]["rule_id"] == "R016", "compliance block must be the real evaluate_compliance() output, not a stub"

print("test_compliance.py: all guards passed")
