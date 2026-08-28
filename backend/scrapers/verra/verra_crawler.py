#!/usr/bin/env python3
"""
verra_crawler.py — Verra VCS Monthly Crawler (API-based, no browser)
=======================================================================

Simplified pipeline after discovering the registry's own frontend calls a
plain JSON API for project details -- no Playwright, no Chromium, no
cookie banners, no greenlet/threading issues. Just `requests`.

    1. LIST STAGE   — load Verra_Projects.xlsx (manually downloaded
                       Export (All) from the VCS program page)
    2. DIFF STAGE    — compare to last month's list -> new/changed/removed
    3. DETAIL STAGE  — GET the project API directly, per ID
    4. PARSE/STORE   — normalize into ProjectSnapshot schema, write
                       versioned JSON
    5. VALIDATE      — counts, fail-rate, zero-document alerts

Usage
-----
    pip install requests pandas openpyxl

    # Full monthly run: every AFOLU project in the list
    python verra_crawler.py --excel Verra_Projects.xlsx

    # Incremental: new IDs + status-changed IDs + a 5% QA sample
    python verra_crawler.py --excel Verra_Projects.xlsx --incremental

    # Test on a couple of IDs first
    python verra_crawler.py --excel Verra_Projects.xlsx --ids 1360,2044

    # Resume an interrupted run
    python verra_crawler.py --excel Verra_Projects.xlsx --resume

Output layout
-------------
data/
├── latest.txt
└── runs/
    └── 2026-08-25/
        ├── list.csv
        ├── meta.json
        ├── failed.csv
        └── projects/
            └── 2044.json          # normalized ProjectSnapshot (includes
                                    # the full raw API payload under
                                    # detail_json -- nothing is discarded)

Environment overrides
----------------------
    VERRA_MAX_WORKERS     default: 4     (plain requests -- threads are
                                          safe here, unlike the old
                                          Playwright-based version)
    VERRA_DELAY_MIN       default: 1.0
    VERRA_DELAY_MAX       default: 2.0
    VERRA_QA_SAMPLE_PCT   default: 5     (for --incremental mode)
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from verra_list import (
    load_project_list, filter_afolu, save_list_csv,
    load_previous_list, diff_lists,
)
from verra_api import make_session, fetch_project_detail, fetch_project_statistics, VerraAPIError
from verra_normalizer import normalize

MAX_WORKERS = int(os.environ.get("VERRA_MAX_WORKERS", "4"))
DELAY_MIN = float(os.environ.get("VERRA_DELAY_MIN", "1.0"))
DELAY_MAX = float(os.environ.get("VERRA_DELAY_MAX", "2.0"))
QA_SAMPLE_PCT = float(os.environ.get("VERRA_QA_SAMPLE_PCT", "5"))

DATA_ROOT = Path("data")
RUNS_ROOT = DATA_ROOT / "runs"
LATEST_POINTER = DATA_ROOT / "latest.txt"


def setup_logging(run_dir: Path) -> logging.Logger:
    run_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("verra_crawler")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    fh = logging.FileHandler(run_dir / "crawler.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


def polite_sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def get_previous_run_dir() -> Optional[Path]:
    if LATEST_POINTER.exists():
        p = Path(LATEST_POINTER.read_text(encoding="utf-8").strip())
        if p.exists():
            return p
    return None


def pick_qa_sample(ids: list[str], pct: float) -> list[str]:
    if not ids or pct <= 0:
        return []
    n = max(1, int(len(ids) * pct / 100))
    return random.sample(ids, min(n, len(ids)))


# Thread-local requests.Session -- requests IS thread-safe when each
# thread uses its own Session (unlike Playwright, there's no greenlet
# machinery here, so this is just the standard, unremarkable pattern).
_thread_local = threading.local()


def _get_thread_session():
    if not hasattr(_thread_local, "session"):
        _thread_local.session = make_session()
    return _thread_local.session


def process_one(project_id: str, list_row: Optional[dict],
                 run_dir: Path, skip_existing: bool = False) -> dict[str, Any]:
    out_path = run_dir / "projects" / f"{project_id}.json"

    if skip_existing and out_path.exists():
        return {"project_id": project_id, "ok": True, "error": None, "skipped": True}

    session = _get_thread_session()
    try:
        raw = fetch_project_detail(session, project_id)
    except VerraAPIError as e:
        return {"project_id": project_id, "ok": False, "error": str(e), "skipped": False}

    # Units (Issued/Active/Retired/Buffer/Cancelled) come from a SEPARATE
    # endpoint keyed by the project's INTERNAL numeric id (raw["project_id"]),
    # not the public VCS number. A stats failure is logged but doesn't fail
    # the whole project -- the detail data on its own is still worth
    # keeping, and units_summary just falls back to the (less reliable)
    # mixedUnitList-based guess in that case.
    stats = None
    stats_error = None
    internal_id = raw.get("project_id")
    if internal_id:
        try:
            stats = fetch_project_statistics(session, internal_id)
        except VerraAPIError as e:
            stats_error = str(e)
    else:
        stats_error = "No internal project_id in detail response -- can't fetch stats."

    normalized = normalize(raw, stats)
    normalized["source_url"] = (
        f"https://prod-us.api.platts.com/ci-raas-prod/br-reg/rest/"
        f"public-report-manager/getProjectById/{project_id}/Markit"
    )
    normalized["stats_error"] = stats_error
    if list_row is not None:
        normalized["list_fields"] = list_row.get("raw")

    (run_dir / "projects").mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2, default=str)

    return {
        "project_id": project_id,
        "ok": True,
        "error": None,
        "skipped": False,
        "document_count": len(normalized.get("documents", [])),
        "stats_error": stats_error,
    }


def parse_args():
    p = argparse.ArgumentParser(description="Verra VCS monthly crawler (API-based)")
    p.add_argument("--excel", type=str, default="Verra_Projects.xlsx",
                    help="Path to the manually-downloaded Export (All) file.")
    p.add_argument("--ids", type=str, default=None,
                    help="Comma-separated project IDs, or a path to a file with one "
                         "ID per line, to scrape only that subset.")
    p.add_argument("--incremental", action="store_true",
                    help="Only scrape new_ids + status_changed_ids + a QA sample of "
                         "unchanged_ids, instead of the full AFOLU-filtered list.")
    p.add_argument("--resume", action="store_true",
                    help="Skip project IDs that already have a saved projects/<id>.json "
                         "in this run's output folder.")
    p.add_argument("--list-only", action="store_true",
                    help="Only run the list/diff stage, skip detail fetching.")
    args, _unknown = p.parse_known_args()  # tolerate Jupyter/Colab's injected -f kernel.json
    return args


def load_id_subset(spec: str) -> list[str]:
    path = Path(spec)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    return [s.strip() for s in spec.split(",") if s.strip()]


def main() -> int:
    args = parse_args()

    run_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run_dir = RUNS_ROOT / run_date
    log = setup_logging(run_dir)

    log.info("=" * 70)
    log.info("Verra VCS Monthly Crawler (API-based) — starting run")
    log.info(f"Run date: {run_date}")
    log.info("=" * 70)

    # ---- Stage 1: LIST ----
    excel_path = Path(args.excel)
    if not excel_path.exists():
        log.error(f"Excel file not found: {excel_path}. Download 'Export (All)' from "
                  f"https://registry.verra.org/verra/public/program/VCS and place it there, "
                  f"or pass --excel /path/to/file.xlsx")
        return 1

    log.info(f"Loading project list from {excel_path}...")
    all_rows = load_project_list(excel_path)
    log.info(f"Loaded {len(all_rows)} total rows.")

    filtered_rows, had_sectoral_data = filter_afolu(all_rows)
    if not had_sectoral_data:
        log.warning(
            "No 'Sectoral Scope' or 'AFOLU Activities' column data found -- "
            "the AFOLU filter is a no-op this run. Check COLUMN_ALIASES in verra_list.py."
        )
    log.info(f"AFOLU-filtered to {len(filtered_rows)} rows.")

    save_list_csv(filtered_rows, run_dir / "list.csv")
    by_id = {str(r["project_id"]): r for r in filtered_rows if r.get("project_id")}
    all_by_id = {str(r["project_id"]): r for r in all_rows if r.get("project_id")}

    # ---- Stage 2: DIFF ----
    prev_run_dir = get_previous_run_dir()
    prev_list_path = (prev_run_dir / "list.csv") if prev_run_dir else None
    previous_by_id = load_previous_list(prev_list_path)
    diff = diff_lists(filtered_rows, previous_by_id)
    log.info(f"Diff vs previous run ({prev_run_dir}): "
              f"{len(diff['new_ids'])} new, {len(diff['removed_ids'])} removed, "
              f"{len(diff['status_changed_ids'])} status-changed, "
              f"{len(diff['unchanged_ids'])} unchanged.")

    if args.list_only:
        log.info("--list-only set: stopping after list/diff stage.")
        return 0

    # ---- Decide target ID set ----
    if args.ids:
        target_ids = load_id_subset(args.ids)
        log.info(f"Using explicit ID subset: {len(target_ids)} projects.")
        off_list = [pid for pid in target_ids if pid not in by_id and pid in all_by_id]
        if off_list:
            log.warning(f"{len(off_list)} requested ID(s) aren't AFOLU-flagged but were "
                        f"found in the full export -- using their Excel row anyway: {off_list}")
    elif args.incremental:
        qa_sample = pick_qa_sample(diff["unchanged_ids"], QA_SAMPLE_PCT)
        target_ids = sorted(set(diff["new_ids"]) | set(diff["status_changed_ids"]) | set(qa_sample))
        log.info(f"Incremental mode: {len(diff['new_ids'])} new + "
                  f"{len(diff['status_changed_ids'])} changed + "
                  f"{len(qa_sample)} QA sample = {len(target_ids)} projects.")
    else:
        target_ids = sorted(by_id.keys())
        log.info(f"Full refresh mode: {len(target_ids)} projects.")

    if not target_ids:
        log.info("No projects to fetch this run. Done.")
        return 0

    # ---- Stage 3+4: DETAIL + PARSE/STORE ----
    successes, failures = [], []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(
                process_one, pid, (by_id.get(pid) or all_by_id.get(pid)), run_dir, args.resume
            ): pid
            for pid in target_ids
        }
        for future in as_completed(futures):
            pid = futures[future]
            try:
                result = future.result()
            except Exception as e:  # noqa: BLE001
                result = {"project_id": pid, "ok": False, "error": f"Unexpected exception: {e}"}

            if result.get("skipped"):
                log.info(f"[{pid}] Skipped (already downloaded, --resume).")
            elif result.get("ok"):
                log.info(f"[{pid}] OK -> {run_dir / 'projects' / f'{pid}.json'} "
                          f"(documents={result.get('document_count')})")
                if result.get("stats_error"):
                    log.warning(f"[{pid}] Detail OK but stats fetch failed: {result['stats_error']}")
            else:
                log.error(f"[{pid}] FAILED: {result.get('error')}")

            (successes if result.get("ok") else failures).append(
                {"project_id": pid, "error": result.get("error")}
            )
            polite_sleep()

    # ---- Stage 5: VALIDATE ----
    with open(run_dir / "failed.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["project_id", "error"])
        for row in failures:
            writer.writerow([row["project_id"], row["error"]])

    total_targeted = len(target_ids)
    fail_rate = (len(failures) / total_targeted * 100) if total_targeted else 0.0
    list_count_drop_pct = None
    if prev_list_path and prev_list_path.exists():
        prev_count = len(previous_by_id)
        if prev_count:
            list_count_drop_pct = (prev_count - len(filtered_rows)) / prev_count * 100

    zero_doc_count = 0
    for row in successes:
        proj_path = run_dir / "projects" / f"{row['project_id']}.json"
        if proj_path.exists():
            try:
                with open(proj_path, encoding="utf-8") as f:
                    snap = json.load(f)
                if not snap.get("documents"):
                    zero_doc_count += 1
            except Exception:
                pass

    alerts = []
    if fail_rate > 5:
        alerts.append(f"fail_rate {fail_rate:.1f}% exceeds 5% threshold")
    if list_count_drop_pct is not None and list_count_drop_pct > 2:
        alerts.append(f"list count dropped {list_count_drop_pct:.1f}% vs previous run (>2% threshold)")
    if zero_doc_count > 0:
        alerts.append(f"{zero_doc_count} project(s) fetched with zero documents found")

    meta = {
        "run_date": run_date,
        "excel_source": str(excel_path),
        "total_listed": len(all_rows),
        "afolu_filtered": len(filtered_rows),
        "had_sectoral_data": had_sectoral_data,
        "diff_vs_previous": diff,
        "total_targeted": total_targeted,
        "succeeded": len(successes),
        "failed": len(failures),
        "fail_rate_pct": round(fail_rate, 2),
        "list_count_drop_pct": round(list_count_drop_pct, 2) if list_count_drop_pct is not None else None,
        "zero_document_count": zero_doc_count,
        "alerts": alerts,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(run_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    LATEST_POINTER.write_text(str(run_dir), encoding="utf-8")

    log.info("=" * 70)
    log.info("Crawl complete.")
    log.info(json.dumps(meta, indent=2))
    if alerts:
        log.warning("ALERTS: " + " | ".join(alerts))
    log.info(f"Run output: {run_dir}")
    log.info("=" * 70)

    return 0 if not failures else 2


if __name__ == "__main__":
    sys.exit(main())