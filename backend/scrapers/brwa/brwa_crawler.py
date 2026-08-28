#!/usr/bin/env python3
"""
BRWA (brwa.id) — Full Wilayah Adat Data Lake Crawler
======================================================

Downloads ALL "Wilayah Adat" (customary/indigenous territory) records from
the public BRWA registry:

  1. The full list (GET /api/data/wa) -- basic fields for all 2,283+ areas
     (idx, name, province, regency, area, population, registration date,
     status, policy status). Confirmed working URL pattern:

       https://brwa.id/api/data/wa?draw=1&start=0&length=5000&id_propinsi=0&id_kabupaten=0

     The plain endpoint without id_propinsi/id_kabupaten silently caps at
     100 rows regardless of start/length/draw -- passing those two params
     (even as the "no filter" sentinel value 0) is what unlocks the full
     recordsTotal-sized response. This was confirmed against a live fetch
     returning all 2283 unique idx values in one response.

  2. Every individual profile page (GET /profil/{idx}), parsed for:
       - Administratif table (Propinsi/Kabupaten/Kecamatan/Desa)
       - Kewilayahan table (Luas/Satuan/Kondisi Fisik)
       - All narrative sections (Profil, Batas Wilayah, Sejarah,
         Kelembagaan Adat, Tata Ruang, Pranata Penguasaan, Pranata Sosial
         Budaya, Potensi & Keanekaragaman Hayati, Kebijakan)
       - The Kebijakan (policy/regulation) table + PDF links
       - The embedded waGeoJSON polygon -> saved as a standalone .geojson
       - Any gallery images
  3. Downloads every linked PDF (regulations/decrees) to disk.

Uses brwa_parser.py for all HTML parsing (shared, no-network logic) so the
same parser that has been validated against a real saved profile page is
used here for live crawling.

Output layout
-------------
data/
├── wa_list.json                  # full raw list (2283 rows)
├── profiles/
│   └── <idx>.json                # parsed structured profile
├── geojson/
│   └── <idx>.geojson             # standalone GeoJSON polygon/multipolygon
├── pdfs/
│   └── <idx>_<filename>.pdf      # every regulation/decree PDF, namespaced by idx
└── metadata/
    ├── crawl_summary.json
    └── failed_profiles.json

Usage
-----
    pip install requests beautifulsoup4 lxml tqdm
    python brwa_crawler.py

    # Resume an interrupted run (skips idx already saved in data/profiles/):
    python brwa_crawler.py --resume

    # Crawl only a specific subset of idx values (comma-separated or a file,
    # one idx per line) -- useful for testing or splitting work across runs:
    python brwa_crawler.py --idx-file my_idx_subset.txt

Environment overrides (optional)
---------------------------------
    BRWA_BASE_URL        default: https://brwa.id
    BRWA_LIST_URL        default: the confirmed full-list URL above
    BRWA_MAX_WORKERS     default: 3     (profile pages fetched in parallel)
    BRWA_DELAY_MIN       default: 1.0   (politeness delay, seconds)
    BRWA_DELAY_MAX       default: 2.0
    BRWA_TIMEOUT         default: 30
    BRWA_MAX_RETRIES     default: 5
    BRWA_DOWNLOAD_PDFS   default: 1     (set to 0 to skip PDF downloads)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import requests

from brwa_parser import parse_profile_html, extract_geojson

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(iterable=None, total=None, desc=None, **kwargs):
        if iterable is not None:
            return iterable
        return _NoOpBar(total, desc)

    class _NoOpBar:
        def __init__(self, total, desc):
            self.total = total
            self.n = 0

        def update(self, n=1):
            self.n += n

        def close(self):
            pass


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

BASE_URL = os.environ.get("BRWA_BASE_URL", "https://brwa.id")
LIST_PATH = "/api/data/wa"
# CONFIRMED: id_propinsi=0&id_kabupaten=0 (the "no filter" sentinel values)
# are what unlock the full recordsTotal-sized response -- without them the
# endpoint silently caps at 100 rows regardless of start/length/draw.
LIST_URL = os.environ.get(
    "BRWA_LIST_URL",
    f"{BASE_URL}/api/data/wa?draw=1&start=0&length=5000&id_propinsi=0&id_kabupaten=0",
)
PROFILE_PATH_TEMPLATE = "/profil/{idx}"

MAX_WORKERS = int(os.environ.get("BRWA_MAX_WORKERS", "3"))
DELAY_MIN = float(os.environ.get("BRWA_DELAY_MIN", "1.0"))
DELAY_MAX = float(os.environ.get("BRWA_DELAY_MAX", "2.0"))
TIMEOUT = int(os.environ.get("BRWA_TIMEOUT", "30"))
MAX_RETRIES = int(os.environ.get("BRWA_MAX_RETRIES", "5"))
DOWNLOAD_PDFS = os.environ.get("BRWA_DOWNLOAD_PDFS", "1") == "1"
BACKOFF_BASE = 1.5
BACKOFF_MAX = 60.0

OUTPUT_ROOT = Path("data")
PROFILES_DIR = OUTPUT_ROOT / "profiles"
GEOJSON_DIR = OUTPUT_ROOT / "geojson"
PDFS_DIR = OUTPUT_ROOT / "pdfs"
METADATA_DIR = OUTPUT_ROOT / "metadata"

USER_AGENT = os.environ.get(
    "BRWA_USER_AGENT",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
)


# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------

def setup_logging() -> logging.Logger:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("brwa_crawler")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    fh = logging.FileHandler(OUTPUT_ROOT / "crawler.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger


log = setup_logging()


# --------------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------------

class FetchError(Exception):
    pass


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        "Connection": "keep-alive",
    })
    return s


def list_headers() -> dict:
    """Extra headers for the /api/data/wa AJAX call specifically -- DataTables
    endpoints commonly gate on X-Requested-With and a same-site Referer, and
    a bare crawler-style request without these (or with a self-identifying
    User-Agent) can get a 403 from a WAF even though a real browser's
    identical GET succeeds fine."""
    return {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"{BASE_URL}/data-wilayah-adat",
    }


def profile_headers() -> dict:
    return {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": f"{BASE_URL}/data-wilayah-adat",
    }


def polite_sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def fetch(session: requests.Session, url: str, params: Optional[dict] = None,
          max_retries: int = MAX_RETRIES, timeout: int = TIMEOUT,
          as_json: bool = False, headers: Optional[dict] = None):
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            resp = session.get(url, params=params, timeout=timeout, headers=headers)
            if resp.status_code == 429 or resp.status_code == 403 or resp.status_code >= 500:
                raise requests.exceptions.HTTPError(f"Retryable status {resp.status_code}", response=resp)
            resp.raise_for_status()
            return resp.json() if as_json else resp
        except requests.exceptions.HTTPError as e:
            status = getattr(e.response, "status_code", None)
            if status is not None and status < 500 and status not in (429, 403):
                log.error(f"Non-retryable HTTP {status} for {url}: {e}")
                raise FetchError(f"HTTP {status} for {url}") from e
            last_exc = e
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, ValueError) as e:
            last_exc = e

        if attempt < max_retries:
            sleep_time = min(BACKOFF_MAX, BACKOFF_BASE * (2 ** attempt)) + random.uniform(0, 1.0)
            log.warning(f"Attempt {attempt+1}/{max_retries+1} failed for {url} ({last_exc}). Retry in {sleep_time:.1f}s")
            time.sleep(sleep_time)
    log.error(f"All attempts failed for {url}: {last_exc}")
    raise FetchError(f"Exhausted retries for {url}") from last_exc


# --------------------------------------------------------------------------
# Step 1: Fetch full list (confirmed single-request URL)
# --------------------------------------------------------------------------

def fetch_all_wa_list(session: requests.Session) -> list[dict]:
    """
    Fetches the full Wilayah Adat list in one request using the confirmed
    working URL (id_propinsi=0&id_kabupaten=0 unlocks the full recordsTotal
    -sized response; without those two params the endpoint silently caps
    at 100 rows no matter what start/length/draw you send).

    Falls back to a warning (not a crash) if recordsTotal doesn't match the
    row count actually returned, so a future change in the endpoint's
    behavior is loud and obvious rather than silently truncating data.
    """
    log.info(f"Fetching full Wilayah Adat list from:\n  {LIST_URL}")
    try:
        payload = fetch(session, LIST_URL, as_json=True, headers=list_headers())
    except FetchError as e:
        log.error(f"Failed to fetch the list: {e}")
        return []

    data = payload.get("data") if isinstance(payload, dict) else None
    if not data:
        log.error("List response had no 'data' field — aborting.")
        return []

    recordsTotal = payload.get("recordsTotal")

    # De-duplicate by idx just in case
    seen = set()
    deduped = []
    for row in data:
        i = row.get("idx")
        if i in seen:
            continue
        seen.add(i)
        deduped.append(row)

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_ROOT / "wa_list.json", "w", encoding="utf-8") as f:
        json.dump({
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "recordsTotal": recordsTotal,
            "recordsFiltered": payload.get("recordsFiltered"),
            "total_fetched": len(deduped),
            "source_url": LIST_URL,
            "data": deduped,
        }, f, ensure_ascii=False, indent=2)

    if recordsTotal and len(deduped) < recordsTotal:
        log.warning(
            f"Only retrieved {len(deduped)} of {recordsTotal} listed areas in this "
            f"single request. If BRWA's dataset has grown past the length=5000 cap "
            f"used here, bump BRWA_LIST_URL's length param higher."
        )
    else:
        log.info(f"List crawl complete: {len(deduped)} areas (recordsTotal={recordsTotal}).")

    return deduped


def extract_idx_from_link(row: dict) -> Optional[str]:
    """The list API embeds idx both as a top-level field and inside the
    nama_kewilayahan HTML anchor -- prefer the direct field, fall back to
    parsing the anchor's data-id."""
    if row.get("idx"):
        return str(row["idx"])
    m = re.search(r'data-id="(\d+)"', row.get("nama_kewilayahan", ""))
    return m.group(1) if m else None


# --------------------------------------------------------------------------
# Step 2: Fetch + parse every profile page
# --------------------------------------------------------------------------

def download_pdfs_for_profile(session: requests.Session, idx: str, pdf_urls: list[str]) -> list[str]:
    saved = []
    for url in pdf_urls:
        try:
            resp = fetch(session, url, timeout=TIMEOUT, headers=profile_headers())
            filename = url.rsplit("/", 1)[-1] or f"{idx}.pdf"
            filepath = PDFS_DIR / f"{idx}_{filename}"
            with open(filepath, "wb") as f:
                f.write(resp.content)
            saved.append(str(filepath))
            log.info(f"[{idx}] Saved PDF -> {filepath}")
        except FetchError as e:
            log.error(f"[{idx}] Failed to download PDF {url}: {e}")
        polite_sleep()
    return saved


def process_one_profile(session: requests.Session, idx: str, skip_existing: bool = False) -> tuple[str, Optional[dict], Optional[str]]:
    existing_path = PROFILES_DIR / f"{idx}.json"
    if skip_existing and existing_path.exists():
        try:
            with open(existing_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            return idx, cached, None
        except Exception:
            pass  # fall through and re-fetch if the cached file is corrupt

    url = f"{BASE_URL}{PROFILE_PATH_TEMPLATE.format(idx=idx)}"
    try:
        resp = fetch(session, url, timeout=TIMEOUT, headers=profile_headers())
        html = resp.text
    except FetchError as e:
        return idx, None, str(e)

    try:
        profile, geojson = parse_profile_html(html, idx=idx, base_url=BASE_URL)
    except Exception as e:  # noqa: BLE001
        return idx, None, f"Parse error: {e}"

    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROFILES_DIR / f"{idx}.json", "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)

    if geojson is not None:
        GEOJSON_DIR.mkdir(parents=True, exist_ok=True)
        with open(GEOJSON_DIR / f"{idx}.geojson", "w", encoding="utf-8") as f:
            json.dump(geojson, f, indent=2)

    if DOWNLOAD_PDFS and profile.get("pdf_links"):
        PDFS_DIR.mkdir(parents=True, exist_ok=True)
        profile["downloaded_pdf_files"] = download_pdfs_for_profile(session, idx, profile["pdf_links"])
        # re-save with the download manifest included
        with open(PROFILES_DIR / f"{idx}.json", "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)

    return idx, profile, None


def crawl_all_profiles(session: requests.Session, idxs: list[str], skip_existing: bool = False) -> tuple[list[dict], list[dict]]:
    successes, failures = [], []

    log.info(f"Starting profile crawl for {len(idxs)} areas (concurrency={MAX_WORKERS}, "
             f"{DELAY_MIN}-{DELAY_MAX}s politeness delay per request"
             f"{', resuming (skipping already-downloaded)' if skip_existing else ''})...")

    # NOTE: ThreadPoolExecutor workers each sleep independently between their
    # own requests, so overall request rate scales with MAX_WORKERS. Keep
    # MAX_WORKERS low (2-4) to stay polite to the server.
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_one_profile, session, idx, skip_existing): idx for idx in idxs}
        with tqdm(total=len(idxs), desc="Crawling profiles", unit="area") as bar:
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    idx, profile, error = future.result()
                except Exception as e:  # noqa: BLE001
                    profile, error = None, f"Unexpected exception: {e}"
                if profile is not None:
                    successes.append({"idx": idx, "title": profile.get("title")})
                else:
                    failures.append({"idx": idx, "error": error})
                bar.update(1)
                polite_sleep()

    return successes, failures


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="BRWA Wilayah Adat crawler")
    p.add_argument("--resume", action="store_true",
                    help="Skip idx values that already have a saved profiles/<idx>.json")
    p.add_argument("--idx-file", type=str, default=None,
                    help="Path to a file with one idx per line, OR a comma-separated "
                         "list of idx values, to crawl only that subset instead of "
                         "everything in the list endpoint.")
    p.add_argument("--list-only", action="store_true",
                    help="Only fetch/save the list (data/wa_list.json), skip profile crawling.")
    # Use parse_known_args instead of parse_args: Colab/Jupyter injects its own
    # "-f /root/.../kernel-xxxx.json" argument when running inside a notebook,
    # which argparse would otherwise reject as unrecognized and exit(2).
    args, _unknown = p.parse_known_args()
    return args


def load_idx_subset(spec: str) -> list[str]:
    path = Path(spec)
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    return [s.strip() for s in spec.split(",") if s.strip()]


def main() -> int:
    args = parse_args()
    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    session = make_session()

    log.info("=" * 70)
    log.info("BRWA Wilayah Adat Data Lake Crawler — starting run")
    log.info(f"Base URL: {BASE_URL}")
    log.info("=" * 70)

    rows = fetch_all_wa_list(session)
    if not rows:
        log.error("No areas retrieved from list endpoint. Aborting.")
        return 1

    if args.list_only:
        log.info("--list-only set: stopping after list fetch.")
        return 0

    if args.idx_file:
        idxs = load_idx_subset(args.idx_file)
        log.info(f"Using idx subset from {args.idx_file}: {len(idxs)} areas.")
    else:
        idxs = [extract_idx_from_link(r) for r in rows]
        idxs = [i for i in idxs if i]

    successes, failures = crawl_all_profiles(session, idxs, skip_existing=args.resume)

    with open(METADATA_DIR / "failed_profiles.json", "w", encoding="utf-8") as f:
        json.dump({"failed_count": len(failures), "failed": failures,
                    "generated_at": datetime.now(timezone.utc).isoformat()}, f, ensure_ascii=False, indent=2)

    summary = {
        "total_listed": len(rows),
        "total_targeted": len(idxs),
        "profiles_downloaded": len(successes),
        "profiles_failed": len(failures),
        "crawl_timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with open(METADATA_DIR / "crawl_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    log.info("=" * 70)
    log.info("Crawl complete.")
    log.info(json.dumps(summary, indent=2))
    log.info(f"List:      {OUTPUT_ROOT / 'wa_list.json'}")
    log.info(f"Profiles:  {PROFILES_DIR}/ ({len(successes)} files)")
    log.info(f"GeoJSON:   {GEOJSON_DIR}/")
    log.info(f"PDFs:      {PDFS_DIR}/")
    log.info(f"Failed:    {METADATA_DIR / 'failed_profiles.json'}")
    log.info("=" * 70)

    return 0 if not failures else 2


if __name__ == "__main__":
    sys.exit(main())
