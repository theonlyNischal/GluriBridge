#!/usr/bin/env python3
"""
SRN-PPI Indonesia — All-Sector Mitigation Project Crawler
============================================================

Downloads ALL mitigation projects (action=Mitigasi, all sectors) from the
public SRN-PPI Indonesia API (api.srnmenlh.id) and stores the COMPLETE,
unmodified raw JSON for:

  1. The paginated project list
     (GET /api/mitigation-spe-certificate/mitigation-list-certificates)
  2. Every individual project's detail record
     (GET /api/statistic/mitigation/{project_id})

No fields are flattened, renamed, dropped, or assumed to have a fixed
schema. Everything is stored exactly as the API returns it.

NOTE: as of this writing, requesting pageSize=200 with action=Mitigasi
returns ALL projects (total=191) in a single page (page_total=1), since
191 < 200. The pagination loop below is kept anyway for safety in case
the total grows past the requested page size in the future -- in that
case the API would presumably split responses (e.g. [0-99], [100-199],
[200-...]) and this loop will walk through every page.

Output layout
-------------
data/
├── project_list/
│   └── all_projects.json        # full raw list responses, all pages merged
├── raw_details/
│   ├── <registry_no_or_id>.json # one file per project, raw detail response
│   └── ...
├── metadata/
│   ├── crawl_summary.json       # data quality report
│   └── failed_projects.json     # ids that failed after all retries
└── crawler.log                  # full run log

Usage
-----
    pip install requests tqdm
    python srn_ppi_crawler.py

Environment overrides (optional)
---------------------------------
    SRN_BASE_URL        default: https://api.srnmenlh.id
    SRN_ACTION          default: Mitigasi
    SRN_PAGE_SIZE       default: 200
    SRN_MAX_WORKERS     default: 4   (parallel detail fetches)
    SRN_TIMEOUT         default: 30  (seconds per request)
    SRN_MAX_RETRIES     default: 5
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

try:
    from tqdm import tqdm
except ImportError:  # graceful fallback if tqdm isn't installed
    def tqdm(iterable=None, total=None, desc=None, **kwargs):
        if iterable is not None:
            return iterable
        return _NoOpBar(total, desc)

    class _NoOpBar:
        def __init__(self, total, desc):
            self.total = total
            self.desc = desc
            self.n = 0

        def update(self, n=1):
            self.n += n

        def close(self):
            pass


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

BASE_URL = os.environ.get("SRN_BASE_URL", "https://api.srnmenlh.id")
LIST_PATH = "/api/mitigation-spe-certificate/mitigation-list-certificates"
DETAIL_PATH_TEMPLATE = "/api/statistic/mitigation/{project_id}"

ACTION = os.environ.get("SRN_ACTION", "Mitigasi")
PAGE_SIZE = int(os.environ.get("SRN_PAGE_SIZE", "200"))

MAX_WORKERS = int(os.environ.get("SRN_MAX_WORKERS", "4"))
TIMEOUT = int(os.environ.get("SRN_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("SRN_MAX_RETRIES", "5"))
BACKOFF_BASE = 1.5          # seconds; backoff = BACKOFF_BASE * 2**attempt (+ jitter)
BACKOFF_MAX = 60.0

OUTPUT_ROOT = Path("data")
PROJECT_LIST_DIR = OUTPUT_ROOT / "project_list"
RAW_DETAILS_DIR = OUTPUT_ROOT / "raw_details"
METADATA_DIR = OUTPUT_ROOT / "metadata"

USER_AGENT = "srn-ppi-mitigation-data-lake-crawler/1.0"


# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------

def setup_logging() -> logging.Logger:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("srn_ppi_crawler")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )

    file_handler = logging.FileHandler(OUTPUT_ROOT / "crawler.log", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(fmt)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    return logger


log = setup_logging()


# --------------------------------------------------------------------------
# HTTP helpers — manual retry loop with exponential backoff + jitter
# --------------------------------------------------------------------------

class FetchError(Exception):
    """Raised when a URL could not be fetched after all retries."""


def make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        }
    )
    return session


def fetch_json(
    session: requests.Session,
    url: str,
    params: Optional[dict] = None,
    max_retries: int = MAX_RETRIES,
    timeout: int = TIMEOUT,
) -> Any:
    """
    GET a URL and return parsed JSON, retrying with exponential backoff on:
      - connection errors / timeouts
      - HTTP 429 (rate limited)
      - HTTP 5xx (server errors)

    Non-retryable HTTP errors (4xx other than 429) raise immediately.
    Raises FetchError if all retries are exhausted.
    """
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            resp = session.get(url, params=params, timeout=timeout)

            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.exceptions.HTTPError(
                    f"Retryable status {resp.status_code}", response=resp
                )

            resp.raise_for_status()  # raises on other 4xx (non-retryable)
            return resp.json()

        except requests.exceptions.HTTPError as e:
            resp = getattr(e, "response", None)
            status = resp.status_code if resp is not None else None
            if status is not None and status < 500 and status != 429:
                log.error(f"Non-retryable HTTP {status} for {url}: {e}")
                raise FetchError(f"HTTP {status} for {url}") from e
            last_exc = e

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            last_exc = e

        except ValueError as e:  # JSON decode error
            last_exc = e

        if attempt < max_retries:
            sleep_time = min(BACKOFF_MAX, BACKOFF_BASE * (2 ** attempt))
            sleep_time += random.uniform(0, 1.0)  # jitter
            log.warning(
                f"Attempt {attempt + 1}/{max_retries + 1} failed for {url} "
                f"({last_exc}). Retrying in {sleep_time:.1f}s..."
            )
            time.sleep(sleep_time)
        else:
            log.error(f"All {max_retries + 1} attempts failed for {url}: {last_exc}")

    raise FetchError(f"Exhausted retries for {url}") from last_exc


# --------------------------------------------------------------------------
# Step 1: Fetch full project list (with pagination, in case totals grow)
# --------------------------------------------------------------------------

def fetch_all_projects(session: requests.Session) -> list[dict]:
    """
    Paginates through the project list endpoint until no more pages remain.
    Returns the list of raw project dicts, completely unmodified.
    Also preserves every raw page response for the data lake.

    As of writing, page_total is 1 (all 191 projects fit inside a single
    pageSize=200 request), but this loop still walks pages defensively in
    case the API starts chunking responses (e.g. [0-99], [100-199], ...).
    """
    all_projects: list[dict] = []
    raw_pages: list[dict] = []
    page = 1

    log.info(f"Starting project list crawl (action={ACTION})...")

    while True:
        params = {
            "page": page,
            "pageSize": PAGE_SIZE,
            "action": ACTION,
        }
        url = f"{BASE_URL}{LIST_PATH}"
        log.info(f"Fetching project list page {page}...")

        try:
            payload = fetch_json(session, url, params=params)
        except FetchError as e:
            log.error(f"Failed to fetch page {page}, stopping pagination: {e}")
            break

        raw_pages.append({"page": page, "response": payload})

        # Be defensive: don't assume "data" is always present/well-formed.
        page_data = payload.get("data") if isinstance(payload, dict) else None
        if not page_data:
            log.info(f"Page {page} returned no data — pagination complete.")
            break

        all_projects.extend(page_data)
        log.info(
            f"Page {page}: {len(page_data)} projects "
            f"(running total: {len(all_projects)})"
        )

        # Stop if the API's own page_total says we're done, OR if this page
        # was shorter than requested (both signal "last page").
        page_total = payload.get("page_total") if isinstance(payload, dict) else None
        if page_total is not None and page >= page_total:
            break
        if len(page_data) < PAGE_SIZE:
            break

        page += 1

    # De-duplicate by id, just in case pagination overlaps
    seen_ids = set()
    deduped: list[dict] = []
    for p in all_projects:
        pid = p.get("id")
        if pid in seen_ids:
            continue
        seen_ids.add(pid)
        deduped.append(p)
    all_projects = deduped

    # Persist raw list data exactly as received (all pages, unflattened)
    PROJECT_LIST_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROJECT_LIST_DIR / "all_projects.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "total_pages": len(raw_pages),
                "total_projects": len(all_projects),
                "raw_pages": raw_pages,       # every raw page response, untouched
                "data": all_projects,          # merged, deduped convenience list
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    log.info(f"Project list complete: {len(all_projects)} projects across {len(raw_pages)} page(s).")
    return all_projects


# --------------------------------------------------------------------------
# Step 2: Fetch every project's detail record
# --------------------------------------------------------------------------

def safe_filename(project: dict) -> str:
    """
    Prefer a human-readable registry number for the filename, falling back
    to the raw id if registry_no isn't present. Never assumes a fixed
    schema beyond this.
    """
    name = (
        project.get("registry_no")
        or project.get("id")
        or "unknown"
    )
    # sanitize for filesystem safety only — does not alter stored content
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in str(name))


def fetch_project_detail(session: requests.Session, project: dict) -> tuple[str, Optional[dict], Optional[str]]:
    """
    Fetches the full detail record for one project.
    Returns (project_id, raw_json_or_None, error_message_or_None).
    """
    project_id = project.get("id")
    if not project_id:
        return "unknown", None, "Project record missing 'id' field"

    url = f"{BASE_URL}{DETAIL_PATH_TEMPLATE.format(project_id=project_id)}"
    try:
        detail = fetch_json(session, url)
        return project_id, detail, None
    except FetchError as e:
        return project_id, None, str(e)


def download_all_details(session: requests.Session, projects: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Downloads detail records for every project, in parallel (bounded worker pool),
    with per-request retry/backoff already handled inside fetch_project_detail.
    Returns (successful_records, failed_records).
    """
    RAW_DETAILS_DIR.mkdir(parents=True, exist_ok=True)

    successes: list[dict] = []
    failures: list[dict] = []

    log.info(f"Starting detail download for {len(projects)} projects "
              f"(concurrency={MAX_WORKERS})...")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_project = {
            executor.submit(fetch_project_detail, session, p): p for p in projects
        }

        with tqdm(total=len(projects), desc="Downloading project details", unit="project") as bar:
            for future in as_completed(future_to_project):
                project = future_to_project[future]
                try:
                    project_id, detail_json, error = future.result()
                except Exception as e:  # noqa: BLE001
                    project_id = project.get("id", "unknown")
                    detail_json = None
                    error = f"Unexpected exception: {e}"

                if detail_json is not None:
                    filename = safe_filename(project) + ".json"
                    filepath = RAW_DETAILS_DIR / filename
                    with open(filepath, "w", encoding="utf-8") as f:
                        json.dump(detail_json, f, ensure_ascii=False, indent=2)

                    successes.append(
                        {
                            "id": project_id,
                            "registry_no": project.get("registry_no"),
                            "file": str(filepath),
                        }
                    )
                    log.info(f"Saved detail for {project_id} -> {filepath}")
                else:
                    failures.append(
                        {
                            "id": project_id,
                            "registry_no": project.get("registry_no"),
                            "activity": project.get("activity"),
                            "error": error,
                        }
                    )
                    log.error(f"FAILED detail fetch for {project_id}: {error}")

                bar.update(1)

    return successes, failures


# --------------------------------------------------------------------------
# Step 3: Data quality report
# --------------------------------------------------------------------------

def is_empty_value(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, (list, dict, str)) and len(v) == 0:
        return True
    return False


def location_is_missing(detail: dict) -> bool:
    loc = detail.get("location")
    if not isinstance(loc, dict) or not loc:
        return True
    return all(is_empty_value(v) for v in loc.values())


def documents_are_missing(detail: dict) -> bool:
    docs = detail.get("program_documents")
    return is_empty_value(docs)


def build_quality_report(
    total_listed: int,
    successes: list[dict],
    failures: list[dict],
) -> dict:
    missing_location = 0
    missing_documents = 0
    sector_counts: dict[str, int] = {}

    for record in successes:
        filepath = Path(record["file"])
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                detail = json.load(f)
        except Exception as e:  # noqa: BLE001
            log.warning(f"Could not re-read {filepath} for quality checks: {e}")
            continue

        if isinstance(detail, dict):
            if location_is_missing(detail):
                missing_location += 1
            if documents_are_missing(detail):
                missing_documents += 1
            for sector in detail.get("sectors", []) or []:
                name = sector.get("name") if isinstance(sector, dict) else str(sector)
                sector_counts[name] = sector_counts.get(name, 0) + 1

    report = {
        "total_projects": total_listed,
        "downloaded": len(successes),
        "failed": len(failures),
        "missing_location": missing_location,
        "missing_documents": missing_documents,
        "sector_counts": sector_counts,
        "crawl_timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return report


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()

    log.info("=" * 70)
    log.info("SRN-PPI Indonesia Mitigation Data Lake Crawler — starting run")
    log.info(f"Base URL: {BASE_URL}")
    log.info(f"Action filter: {ACTION}")
    log.info("=" * 70)

    # --- Step 1: project list ---
    projects = fetch_all_projects(session)
    total_listed = len(projects)

    expected = 191
    if total_listed != expected:
        log.warning(
            f"Project count differs from last known snapshot: expected ~{expected}, "
            f"got {total_listed}. Proceeding anyway — this likely reflects real "
            f"changes on the registry (new submissions, withdrawals, etc.)."
        )
    else:
        log.info(f"Project count matches last known snapshot: {total_listed} projects.")

    if not projects:
        log.error("No projects retrieved. Aborting before detail download.")
        return 1

    # --- Step 2: project details ---
    successes, failures = download_all_details(session, projects)

    # --- Failed projects file ---
    with open(METADATA_DIR / "failed_projects.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "failed_count": len(failures),
                "failed_projects": failures,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    # --- Step 3: data quality / crawl summary ---
    summary = build_quality_report(total_listed, successes, failures)
    with open(METADATA_DIR / "crawl_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    log.info("=" * 70)
    log.info("Crawl complete.")
    log.info(json.dumps(summary, indent=2))
    log.info(f"Project list:     {PROJECT_LIST_DIR / 'all_projects.json'}")
    log.info(f"Raw details:      {RAW_DETAILS_DIR}/ ({len(successes)} files)")
    log.info(f"Failed projects:  {METADATA_DIR / 'failed_projects.json'}")
    log.info(f"Crawl summary:    {METADATA_DIR / 'crawl_summary.json'}")
    log.info("=" * 70)

    return 0 if not failures else 2  # non-zero exit if any project failed


if __name__ == "__main__":
    sys.exit(main())
