#!/usr/bin/env python3
"""
orchestrate.py — thin orchestration layer ABOVE ingestion (the 4 scrapers
under scrapers/) and normalization (gluribridge.pipeline.run_pipeline()).

Deliberately NOT merged into run_pipeline() itself. This implements a
decision already made in the original architecture (ingestion -> raw
storage -> normalization as three separate layers), for concrete reasons:
  - Different cadences per source: SRUK and Verra are checked daily,
    SRN-PPI monthly, BRWA is manual-only. This script never auto-triggers
    BRWA — there's no cheap, reliable automated cadence signal for it
    (2,283 profiles + PDFs is expensive to re-crawl), so it's reported,
    never scraped, here. Run scrapers/brwa/brwa_crawler.py yourself when
    you actually want fresher BRWA data.
  - Different failure domains: one scraper failing (rate limit, site
    change, network blip) must not block re-scoring whatever data already
    exists for the other three sources. Each source's scrape is wrapped
    independently — a failure is logged and the run continues.
  - Reproducible testing: run_pipeline() itself must keep reading a fixed
    set of files and never make a live call — every byte-diff test in this
    project depends on that staying true. This script is the only thing
    that touches the network; run_pipeline() never does.

Usage
-----
    python orchestrate.py                # check cadence, scrape what's due, run pipeline, export
    python orchestrate.py --dry-run      # report what WOULD run/skip, touch nothing
    python orchestrate.py --skip-scrape  # go straight to run_pipeline() on whatever's in data/raw/
    python orchestrate.py --force sruk,verra   # scrape these regardless of cadence (comma-separated)

Freeze (accidental-scrape protection — e.g. rehearsal/demo stability windows)
-------------------------------------------------------------------------
    python orchestrate.py --freeze "reason text"   # write data/.freeze, exit — nothing else runs
    python orchestrate.py --unfreeze               # remove data/.freeze, then continue normally

While data/.freeze exists, every mode except --skip-scrape refuses to run
ANY scraper and exits immediately (exit code 3) — including --force and
--dry-run. --skip-scrape still works while frozen (it never touches a
scraper anyway), so run_pipeline()+export on existing data is always
available. There is no cadence-based auto-unfreeze; only --unfreeze lifts it.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
from datetime import date, datetime, timezone

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
# REPO_ROOT itself (backend/), not REPO_ROOT/gluribridge — the gluribridge
# package folder needs its PARENT on sys.path for `import gluribridge.x` to
# resolve. Before the 2026-08-27 backend/ reorg this pointed at a nested
# gluribridge/gluribridge/ wrapper, where the OUTER folder coincidentally
# being on sys.path still worked because the inner package folder shared
# the same name one level down; that double-nesting is gone now that the
# package lives directly at backend/gluribridge/, so this must point one
# level higher than before.
sys.path.insert(0, REPO_ROOT)

from gluribridge.pipeline import run_pipeline, contact_has_preservable_data  # noqa: E402
from gluribridge.export import export_pipeline_result  # noqa: E402
from gluribridge import news_matching                  # noqa: E402
from gluribridge.tavily_client import TavilyClient      # noqa: E402
from gluribridge.schema import UnifiedCandidateRecord, RegistrantContact  # noqa: E402

DATA_RAW = os.path.join(REPO_ROOT, "data", "raw")
SCRAPERS_ROOT = os.path.join(REPO_ROOT, "scrapers")
# Was "exported_output" — repointed 2026-08-27 during the backend/ reorg so
# orchestrate.py and the FastAPI service (which seeds from this same
# directory) share one canonical source of truth instead of silently
# diverging onto two different export directories over time. The old
# "exported_output" directory (stale, pre-dating this session's fixes) is
# left in place at the repo root, just no longer written to.
EXPORT_DIR = os.path.join(REPO_ROOT, "exported_output_stage3")

# --- cadence rules, in days. None = manual-only, never auto-triggered. ---
CADENCE_DAYS = {
    "sruk": 1,
    "srn_ppi": 30,
    "verra": 1,
    "brwa": None,
}


# --------------------------------------------------------------------------
# Freshness — read whatever fetched_at-style timestamp each source's own
# raw output already carries. No two sources use the same field name/
# location, so each gets its own small reader; all funnel through the same
# (timestamp, source_of_timestamp, note) shape.
# --------------------------------------------------------------------------

def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _freshness_sruk():
    path = os.path.join(DATA_RAW, "sruk", "project_list", "all_projects.json")
    if not os.path.exists(path):
        return None, None, "no project_list/all_projects.json on file yet"
    try:
        ts = _read_json(path).get("fetched_at")
    except (OSError, json.JSONDecodeError) as e:
        return None, None, f"could not read {path}: {e}"
    if not ts:
        return None, None, "fetched_at missing from project_list/all_projects.json"
    return ts, "sruk/project_list/all_projects.json:fetched_at", None


def _freshness_srn_ppi():
    path = os.path.join(DATA_RAW, "srn_ppi", "project_list", "all_projects.json")
    if not os.path.exists(path):
        return None, None, "no project_list/all_projects.json on file yet"
    try:
        ts = _read_json(path).get("fetched_at")
    except (OSError, json.JSONDecodeError) as e:
        return None, None, f"could not read {path}: {e}"
    if not ts:
        return None, None, "fetched_at missing from project_list/all_projects.json"
    return ts, "srn_ppi/project_list/all_projects.json:fetched_at", None


def _freshness_verra():
    latest_ptr = os.path.join(DATA_RAW, "verra", "latest.txt")
    if not os.path.exists(latest_ptr):
        return None, None, "no latest.txt pointer on file yet"
    with open(latest_ptr, encoding="utf-8") as f:
        run_ref = f.read().strip()
    # CONFIRMED on real data (2026-08-26): the latest.txt written before the
    # Task 2 reorg contains a now-STALE relative path ("data/runs/2026-08-25")
    # left over from when this file lived one directory level up. Trusting
    # that string literally breaks after any promotion into data/raw/. Take
    # just the run-dir's basename instead and resolve it against verra's
    # CURRENT runs/ location — robust to this and to any future promotion.
    run_dir_name = os.path.basename(run_ref.rstrip("/"))
    meta_path = os.path.join(DATA_RAW, "verra", "runs", run_dir_name, "meta.json")
    if not os.path.exists(meta_path):
        return None, None, f"latest.txt points at '{run_ref}' but {meta_path} doesn't exist"
    try:
        ts = _read_json(meta_path).get("finished_at")
    except (OSError, json.JSONDecodeError) as e:
        return None, None, f"could not read {meta_path}: {e}"
    if not ts:
        return None, None, "finished_at missing from meta.json"
    return ts, f"verra/runs/{run_dir_name}/meta.json:finished_at", None


def _freshness_brwa():
    path = os.path.join(DATA_RAW, "brwa_profiles", "wa_list.json")
    if not os.path.exists(path):
        return None, None, "no wa_list.json on file yet"
    try:
        data = _read_json(path)
    except (OSError, json.JSONDecodeError) as e:
        return None, None, f"could not read {path}: {e}"
    ts = data.get("fetched_at")
    if ts:
        return ts, "brwa_profiles/wa_list.json:fetched_at", None
    # CONFIRMED on real data (2026-08-26): the wa_list.json currently in
    # data/raw/ predates the current brwa_crawler.py (which DOES write
    # fetched_at) — it has no such field. Falling back to file mtime rather
    # than reporting "unknown" entirely, but this is a weaker signal than a
    # real fetched_at (mtime survives copies/moves, not just fetches) and is
    # labeled as a fallback in the note so it's never confused with a real one.
    mtime = datetime.fromtimestamp(os.path.getmtime(path), tz=timezone.utc).isoformat()
    return mtime, "brwa_profiles/wa_list.json (file mtime, NOT fetched_at)", \
        "fallback: this file predates fetched_at being written; using file mtime instead"


FRESHNESS_READERS = {
    "sruk": _freshness_sruk,
    "srn_ppi": _freshness_srn_ppi,
    "verra": _freshness_verra,
    "brwa": _freshness_brwa,
}


def _age_days(fetched_at: str, reference_date: date) -> int | None:
    if not fetched_at:
        return None
    try:
        dt = datetime.fromisoformat(str(fetched_at).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (reference_date - dt.date()).days


def check_all_freshness(reference_date: date) -> dict:
    """Returns {source: {"fetched_at", "timestamp_source", "note", "age_days"}}."""
    out = {}
    for source, reader in FRESHNESS_READERS.items():
        fetched_at, timestamp_source, note = reader()
        out[source] = {
            "fetched_at": fetched_at,
            "timestamp_source": timestamp_source,
            "note": note,
            "age_days": _age_days(fetched_at, reference_date),
        }
    return out


def is_due(source: str, freshness: dict, forced: set) -> tuple[bool, str]:
    if source in forced:
        return True, "forced via --force"
    cadence = CADENCE_DAYS[source]
    if cadence is None:
        return False, "manual cadence — never auto-triggered"
    age = freshness[source]["age_days"]
    if age is None:
        return True, f"no usable freshness signal ({freshness[source]['note']}) — treating as due"
    if age >= cadence:
        return True, f"age {age}d >= {cadence}d cadence"
    return False, f"age {age}d < {cadence}d cadence — not due yet"


# --------------------------------------------------------------------------
# Scraping + promotion — each scraper writes to its OWN ./data/ directory
# relative to its own script (confirmed this is how all 4 actually behave,
# by running each one for real earlier this project). "Promoting" means
# moving that output into the shared data/raw/<source>/ location
# run_pipeline() reads from — the same steps done by hand earlier in this
# project, now automated.
# --------------------------------------------------------------------------

SCRAPER_SCRIPTS = {
    "sruk": ("sruk", "sruk_indonesia_project_list_scrapping.py", []),
    "srn_ppi": ("srn_ppi", "srn_ppi_crawler.py", []),
    "verra": ("verra", "verra_crawler.py", ["--excel", "Verra_Projects.xlsx"]),
    "brwa": ("brwa", "brwa_crawler.py", []),
}


def run_scraper(source: str) -> tuple[bool, str]:
    """Runs one scraper as a SEPARATE PROCESS (never imported into this
    process — a crash or hang in a scraper must not take this script down).
    Returns (success, message)."""
    subdir, script, extra_args = SCRAPER_SCRIPTS[source]
    scraper_dir = os.path.join(SCRAPERS_ROOT, subdir)
    script_path = os.path.join(scraper_dir, script)
    if not os.path.exists(script_path):
        return False, f"{script_path} not found"

    scratch_data = os.path.join(scraper_dir, "data")
    if os.path.exists(scratch_data):
        shutil.rmtree(scratch_data)  # never trust a leftover scratch dir from a prior interrupted run

    # Verra's own crawler computes diff_vs_previous by reading ITS local
    # data/latest.txt + data/runs/ (see get_previous_run_dir() in
    # verra_crawler.py) — wiping that unconditionally above, as this
    # function used to, silently broke that diff on every orchestrated run
    # (confirmed on the 2026-08-26 live run: it reported 1976/1976 "new",
    # 0 unchanged, for data nearly identical to the day before). Reseed the
    # scratch dir from the CANONICAL data/raw/ copy — never trust a leftover
    # local one, but do give the scraper its own real prior-run history to
    # diff against. Other sources don't have an equivalent local-history
    # feature to preserve.
    if source == "verra":
        canonical = os.path.join(DATA_RAW, "verra")
        if os.path.exists(canonical):
            os.makedirs(scratch_data, exist_ok=True)
            runs_src = os.path.join(canonical, "runs")
            if os.path.isdir(runs_src):
                shutil.copytree(runs_src, os.path.join(scratch_data, "runs"))
            latest_src = os.path.join(canonical, "latest.txt")
            if os.path.exists(latest_src):
                with open(latest_src, encoding="utf-8") as f:
                    run_dir_name = os.path.basename(f.read().strip().rstrip("/"))
                # Write in the format verra_crawler.py itself expects to
                # read back (a path relative to ITS OWN cwd) — not the
                # stale "data/runs/..." string that caused the earlier bug.
                with open(os.path.join(scratch_data, "latest.txt"), "w", encoding="utf-8") as f:
                    f.write(f"data/runs/{run_dir_name}")

    try:
        proc = subprocess.run(
            [sys.executable, script, *extra_args],
            cwd=scraper_dir, capture_output=True, text=True, timeout=3600,
        )
    except subprocess.TimeoutExpired:
        return False, f"{script} timed out after 1 hour"
    except OSError as e:
        return False, f"failed to launch {script}: {e}"

    if proc.returncode not in (0, 2):  # 2 = "ran, some individual items failed" per these scripts' own convention
        tail = "\n".join(proc.stdout.splitlines()[-15:] + proc.stderr.splitlines()[-15:])
        return False, f"{script} exited {proc.returncode}:\n{tail}"

    return True, _promote(source, scraper_dir)


def _promote(source: str, scraper_dir: str) -> str:
    scratch_data = os.path.join(scraper_dir, "data")
    if not os.path.exists(scratch_data):
        return "scraper ran but produced no data/ output — nothing to promote"

    if source in ("sruk", "srn_ppi"):
        dest = os.path.join(DATA_RAW, source)
        for name in os.listdir(scratch_data):
            src = os.path.join(scratch_data, name)
            dst = os.path.join(dest, name)
            if os.path.isdir(src):
                if os.path.exists(dst):
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        shutil.rmtree(scratch_data)
        return f"promoted into data/raw/{source}/"

    if source == "verra":
        dest = os.path.join(DATA_RAW, "verra")
        runs_src = os.path.join(scratch_data, "runs")
        if os.path.isdir(runs_src):
            for run_name in os.listdir(runs_src):
                dst_run = os.path.join(dest, "runs", run_name)
                if os.path.exists(dst_run):
                    shutil.rmtree(dst_run)
                shutil.copytree(os.path.join(runs_src, run_name), dst_run)
        latest_src = os.path.join(scratch_data, "latest.txt")
        if os.path.exists(latest_src):
            with open(latest_src, encoding="utf-8") as f:
                run_ref = f.read().strip()
            # Write a NON-stale pointer this time — just the run-dir name,
            # resolved fresh by _freshness_verra() every time, not a path
            # that assumes where latest.txt itself happens to live.
            with open(os.path.join(dest, "latest.txt"), "w", encoding="utf-8") as f:
                f.write(os.path.basename(run_ref.rstrip("/")))
        shutil.rmtree(scratch_data)
        return "promoted into data/raw/verra/runs/"

    if source == "brwa":
        profiles_dest = os.path.join(DATA_RAW, "brwa_profiles")
        geojson_dest = os.path.join(DATA_RAW, "brwa_geojson", "geojson")
        for name in ("wa_list.json", "crawler.log"):
            src = os.path.join(scratch_data, name)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(profiles_dest, name))
        for name in ("profiles", "pdfs"):
            src = os.path.join(scratch_data, name)
            if os.path.isdir(src):
                for fn in os.listdir(src):
                    shutil.copy2(os.path.join(src, fn), os.path.join(profiles_dest, name, fn))
        geo_src = os.path.join(scratch_data, "geojson")
        if os.path.isdir(geo_src):
            for fn in os.listdir(geo_src):
                shutil.copy2(os.path.join(geo_src, fn), os.path.join(geojson_dest, fn))
        shutil.rmtree(scratch_data)
        return "promoted into data/raw/brwa_profiles/ and data/raw/brwa_geojson/geojson/"

    raise ValueError(f"unknown source: {source}")


# --------------------------------------------------------------------------
# Freeze — a deliberate, explicit gate against accidental re-scraping
# between now and Demo Day. data/.freeze existing means: do not scrape,
# full stop, regardless of cadence-due status and regardless of --force.
# Only --skip-scrape (which never touches a scraper anyway) or an explicit
# --unfreeze on the command line lifts this. There is no cadence-based way
# to auto-lift a freeze — that would defeat the point of it.
# --------------------------------------------------------------------------

FREEZE_PATH = os.path.join(REPO_ROOT, "data", ".freeze")


def read_freeze() -> dict | None:
    if not os.path.exists(FREEZE_PATH):
        return None
    try:
        return _read_json(FREEZE_PATH)
    except (OSError, json.JSONDecodeError):
        # A freeze file that exists but can't be parsed is still a freeze —
        # fail closed (treat as frozen with an unknown reason), never fail
        # open just because the file is malformed.
        return {"frozen_at": None, "reason": "(unparseable .freeze file — treating as frozen; fix or --unfreeze)"}


def write_freeze(reason: str) -> None:
    os.makedirs(os.path.dirname(FREEZE_PATH), exist_ok=True)
    payload = {
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
    }
    with open(FREEZE_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def remove_freeze() -> bool:
    if os.path.exists(FREEZE_PATH):
        os.remove(FREEZE_PATH)
        return True
    return False


# --------------------------------------------------------------------------
# run_pipeline() + export — always the same paths in data/raw/, matching
# every other run this project has done.
# --------------------------------------------------------------------------

def _read_preserve_contacts_by_registry_key() -> dict:
    """
    Reads whatever contact each candidate has on file in the export we're
    about to overwrite, keeping only contacts that carry data a
    registry-only run below can never itself re-derive: Tier B
    ('org_website') / human-reviewed ('manual_review') email, Tier C
    phone/WhatsApp, or a public-presence link (see run_pipeline()'s
    preserve_contacts_by_registry_key docstring and
    contact_has_preservable_data() for why this exists: CONFIRMED real
    bug, 2026-08-30 health-check sweep, for email; a SECOND confirmed
    real bug, 2026-09-04, for Tier C phone/presence — this gate used to
    check email's contact_source only, so a candidate with a real,
    hand-verified phone number but no email at all (contact_source stays
    None) was excluded here entirely and its phone number silently
    vanished on the next rebuild).

    Keyed by registry_ids ('verra_project_id:674', etc.), NOT candidate_id
    — candidate_id is a fresh uuid4() on every run_pipeline() invocation
    (nothing makes it deterministic across reruns; confirmed empirically
    2026-08-31: the same real record got a different candidate_id in two
    back-to-back runs on identical raw data), so a candidate_id-keyed
    lookup would silently match nothing here. registry_ids is the
    registry's own identifier, read straight from the raw source file
    every time — genuinely stable across runs.

    Returns {} on a first-ever run (no export yet) or a malformed/missing
    file — fails open to "nothing to preserve," never blocks the run itself.
    """
    details_path = os.path.join(EXPORT_DIR, "candidate_details.json")
    if not os.path.exists(details_path):
        return {}
    try:
        details_by_id = _read_json(details_path)
    except (OSError, json.JSONDecodeError):
        return {}
    out = {}
    for detail in details_by_id.values():
        contact = detail.get("contact")
        if not contact_has_preservable_data(contact):
            continue
        registry_ids = (detail.get("identity") or {}).get("registry_ids") or {}
        for field in ("sruk_registry_no", "srn_ppi_registry_no", "verra_project_id"):
            value = registry_ids.get(field)
            if value:
                out[f"{field}:{value}"] = contact
    return out


def _read_prior_thin_candidates() -> list:
    """
    Reconstructs every thin (news-only) candidate from the export we're
    about to overwrite, so run_pipeline() can carry forward one that
    isn't rediscovered by THIS round's live news search — see
    run_pipeline()'s prior_thin_candidates docstring for why this
    exists: CONFIRMED real property, 2026-09-04, caught by the user
    ("shouldn't this only grow, not shrink?") — a thin candidate has no
    registry_ids at all, so unlike a registry-sourced candidate it was
    never durable to begin with; it only existed because a past live
    search happened to surface it.

    Deliberately reconstructs ONLY the fields a thin candidate actually
    has on real data (see new_thin_candidate_from_hit() in
    news_matching.py: identity is capped to name/org/country, no
    documents, no carbon tracks, no BRWA evidence — confirmed against
    real exported thin candidates before writing this, not assumed) —
    NOT a general candidate deserializer, and not intended to become
    one; a rich candidate is always recomputed fresh from its own
    registry data every run, which stays correct and is NOT what this
    reads. registrant_contact is reconstructed via RegistrantContact's
    own field set directly (**dict, filtered to real dataclass fields)
    rather than listed out by hand, so a thin candidate that picked up
    real Tier B/C contact data in a later run carries all of it forward
    too — this actually makes the existing registry-id-keyed contact
    preservation moot for thin candidates specifically, since the WHOLE
    record (not just its contact) is what's being carried forward here.

    Returns [] on a first-ever run or a malformed/missing file — fails
    open to "nothing to carry forward," never blocks the run itself.
    """
    details_path = os.path.join(EXPORT_DIR, "candidate_details.json")
    if not os.path.exists(details_path):
        return []
    try:
        details_by_id = _read_json(details_path)
    except (OSError, json.JSONDecodeError):
        return []
    out = []
    for detail in details_by_id.values():
        identity = detail.get("identity") or {}
        if identity.get("data_richness") != "thin":
            continue
        contact = detail.get("contact") or {}
        rec = UnifiedCandidateRecord(
            primary_source="news",
            data_richness="thin",
            verification_status=identity.get("verification_status") or "unverified",
            name=identity.get("name"),
            name_en=identity.get("name_en"),
            org=identity.get("org"),
            province=identity.get("province"),
            district=identity.get("district"),
            country=identity.get("country") or "ID",
            sector=identity.get("sector"),
            registrant_contact=RegistrantContact(
                **{k: v for k, v in contact.items() if k in RegistrantContact.__dataclass_fields__}
            ),
        )
        rec.merged_from = list((detail.get("identity_resolution") or {}).get("merge_history") or [])
        rec.news_evidence = list(detail.get("news_evidence") or [])
        rec.field_sources["name"] = {"source": "news", "source_tier": 4, "retrieved_at": None}
        out.append(rec)
    return out


def get_tavily_api_key() -> str | None:
    """None when unset/blank — the one place every caller (routes.py's
    /stats and /refresh, this module) checks, so "is news enrichment
    available right now" can never drift between what's reported and
    what's actually attempted."""
    return os.environ.get("TAVILY_API_KEY") or None


def _real_provinces_from_last_export() -> list:
    """Distinct real province values from the CURRENT export (before this
    refresh runs) — used to build this round's news search queries.
    Deliberately not a hardcoded/invented province list: real coverage
    already varies (see PROJECT_CONTEXT.md), and a stale hardcoded list
    would silently miss provinces the dataset has since grown into or
    keep querying ones it's dropped out of. Empty list (not an error) if
    no prior export exists yet — build_queries() itself already returns
    a real non-empty query list even with provinces=[] (its global,
    non-province-scoped templates)."""
    path = os.path.join(EXPORT_DIR, "ranked_candidates.json")
    if not os.path.exists(path):
        return []
    try:
        rows = _read_json(path)
    except (OSError, json.JSONDecodeError):
        return []
    provinces = {r.get("province") for r in rows if r.get("province")}
    return sorted(provinces)


def run_normalization_and_export(freshness: dict, with_news: bool = False) -> dict:
    """
    with_news (2026-09-03, Sync page): when True AND a real
    TAVILY_API_KEY is configured, this round's run_pipeline() call also
    does live Tavily news discovery + Tier B contact resolution — the
    same "rich" path previously only ever run by hand (see
    PROJECT_CONTEXT.md Section 7's Open Item #5). Defaults to False,
    matching every existing caller (the background scheduler's automatic
    cadence-based refresh NEVER passes True — see app/scheduler.py — so
    unattended live-API spend stays exactly as impossible as it's always
    been; only an explicit manual request can opt in). Returns
    result["used_news"] so callers/API responses report what actually
    happened rather than assuming the request was honored — a real,
    if rare, race (the key removed between an availability check and
    this call) must never be silently misreported as a rich refresh.
    """
    sruk_files = sorted(glob.glob(os.path.join(DATA_RAW, "sruk", "raw_details", "*.json")))
    srn_ppi_files = sorted(glob.glob(os.path.join(DATA_RAW, "srn_ppi", "raw_details", "*.json")))

    latest_verra_dir = None
    latest_ptr = os.path.join(DATA_RAW, "verra", "latest.txt")
    if os.path.exists(latest_ptr):
        with open(latest_ptr, encoding="utf-8") as f:
            latest_verra_dir = os.path.basename(f.read().strip().rstrip("/"))
    if not latest_verra_dir:
        # fall back to the most recent runs/<date> directory by name
        run_dirs = sorted(glob.glob(os.path.join(DATA_RAW, "verra", "runs", "*")))
        latest_verra_dir = os.path.basename(run_dirs[-1]) if run_dirs else None
    verra_files = sorted(glob.glob(os.path.join(DATA_RAW, "verra", "runs", latest_verra_dir or "*", "projects", "*.json")))

    tavily_client = None
    news_queries = None
    used_news = False
    api_key = get_tavily_api_key() if with_news else None
    if with_news and api_key:
        tavily_client = TavilyClient(api_key=api_key)
        news_queries = news_matching.build_queries(provinces=_real_provinces_from_last_export())
        used_news = True

    result = run_pipeline(
        sruk_files=sruk_files + srn_ppi_files,
        verra_files=verra_files,
        brwa_list_path=os.path.join(DATA_RAW, "brwa_profiles", "wa_list.json"),
        brwa_geojson_dir=os.path.join(DATA_RAW, "brwa_geojson", "geojson"),
        brwa_profile_dir=os.path.join(DATA_RAW, "brwa_profiles", "profiles"),
        tavily_client=tavily_client,
        news_queries=news_queries,
        resolve_contacts_tier_b=used_news,
        source_freshness=freshness,
        preserve_contacts_by_registry_key=_read_preserve_contacts_by_registry_key(),
        # Unconditional, NOT gated on with_news (2026-09-04) — this is
        # exactly what protects a registry-only run (including the
        # background scheduler's own automatic hourly tick, which never
        # passes with_news=True) from silently dropping every thin
        # candidate the way it always used to; see run_pipeline()'s own
        # prior_thin_candidates docstring.
        prior_thin_candidates=_read_prior_thin_candidates(),
    )

    export_summary = export_pipeline_result(result, output_dir=EXPORT_DIR)
    return {"stats": result.stats, "export": export_summary, "used_news": used_news}


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="report what would run/skip, touch nothing")
    p.add_argument("--skip-scrape", action="store_true", help="skip cadence checks entirely, go straight to run_pipeline()")
    p.add_argument("--force", type=str, default="", help="comma-separated sources to scrape regardless of cadence")
    p.add_argument("--freeze", nargs="?", const="manual freeze", default=None, metavar="REASON",
                    help="write data/.freeze with an optional reason, then exit — does nothing else this invocation")
    p.add_argument("--unfreeze", action="store_true",
                    help="remove data/.freeze, then continue with the rest of this invocation normally")
    args = p.parse_args()

    if args.freeze is not None and args.unfreeze:
        print("--freeze and --unfreeze are contradictory — pick one.", file=sys.stderr)
        return 1

    # --freeze is a standalone, deliberate action: write the marker and stop.
    # Never combined with a live run in the same invocation — freezing
    # should never be a side effect of something else you were doing.
    if args.freeze is not None:
        write_freeze(args.freeze)
        frozen = read_freeze()
        print(f"Wrote {FREEZE_PATH}")
        print(f"  frozen_at: {frozen['frozen_at']}")
        print(f"  reason:    {frozen['reason']}")
        print("\nNo scraper will run (in ANY mode except --skip-scrape) until an explicit --unfreeze.")
        return 0

    if args.unfreeze:
        removed = remove_freeze()
        print(f"{'Removed' if removed else 'No freeze file was present to remove:'} {FREEZE_PATH}")
        print("Continuing with this invocation...\n")

    # The freeze gate itself. Checked BEFORE anything else runs (including
    # the freshness/cadence report) so a frozen run genuinely does nothing
    # beyond printing why. Only --skip-scrape (which never touches a
    # scraper regardless) or --unfreeze (handled above, already lifted it)
    # get past this — not --force, not --dry-run, nothing else.
    if not args.unfreeze and not args.skip_scrape:
        frozen = read_freeze()
        if frozen:
            print(f"REFUSING TO RUN: data frozen for demo prep, see {FREEZE_PATH} for when/why.")
            print(f"  frozen_at: {frozen['frozen_at']}")
            print(f"  reason:    {frozen['reason']}")
            print("\nUse --skip-scrape to run the pipeline on existing data without scraping,")
            print("or --unfreeze to explicitly lift the freeze and proceed.")
            return 3

    today = date.today()
    forced = {s.strip() for s in args.force.split(",") if s.strip()}

    print(f"=== orchestrate.py — {today.isoformat()} ===\n")

    freshness = check_all_freshness(today)
    print("Freshness / cadence check:")
    for source in ("sruk", "srn_ppi", "verra", "brwa"):
        f = freshness[source]
        due, why = is_due(source, freshness, forced)
        cadence = CADENCE_DAYS[source]
        cadence_str = f"{cadence}d" if cadence is not None else "manual"
        print(f"  {source:8s}  fetched_at={f['fetched_at']!s:32s}  age={f['age_days']!s:>4}d  "
              f"cadence={cadence_str:6s}  due={due}  ({why})")
        if f["note"]:
            print(f"             note: {f['note']}")

    print()
    if args.skip_scrape:
        print("--skip-scrape: not checking/running any scraper, going straight to run_pipeline().\n")
    else:
        for source in ("sruk", "srn_ppi", "verra", "brwa"):
            due, why = is_due(source, freshness, forced)
            if not due:
                continue
            if args.dry_run:
                print(f"[dry-run] would scrape {source} ({why})")
                continue
            print(f"Scraping {source} ({why})...")
            ok, message = run_scraper(source)
            status = "OK" if ok else "FAILED — continuing with other sources"
            print(f"  {source}: {status} — {message}")
        print()
        # Re-check freshness after any scraping, since it may have changed.
        freshness = check_all_freshness(today)

    if args.dry_run:
        print("[dry-run] not calling run_pipeline() or export_pipeline_result().")
        return 0

    print("Running normalization + export against data/raw/...")
    result = run_normalization_and_export(freshness)
    print()
    print("=== PIPELINE STATS ===")
    print(json.dumps(result["stats"], indent=2))
    print()
    print("=== EXPORT ===")
    print(json.dumps(result["export"], indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
