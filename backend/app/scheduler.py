"""
Background refresh scheduler — reuses orchestrate.py's cadence/freshness/
freeze/scraper logic directly (imported, not reimplemented). This module
adds exactly two things orchestrate.py's CLI doesn't have on its own:
  1. A periodic background loop that calls the same cycle orchestrate.py's
     main() runs, on a timer, inside the FastAPI process.
  2. Loading the resulting exported_output_stage3/ files into SQLite after
     each cycle, so the API serves from the DB, not the files directly.

Deliberately thin — every actual decision (is this source due? is data
frozen? how do I scrape/promote/export?) still lives in orchestrate.py,
exactly as before. This file does not duplicate that logic.
"""
import asyncio
import glob
import json
import logging
import os
from datetime import date, datetime, timezone

import orchestrate
from . import db

logger = logging.getLogger("gluribridge.scheduler")

# How often the background loop wakes up to re-check cadence. Cadence
# itself is daily/monthly/manual (orchestrate.CADENCE_DAYS) — this is just
# the polling granularity, deliberately much finer than the coarsest
# cadence so a "due" source is never missed by more than this interval.
POLL_INTERVAL_SECONDS = 60 * 60  # 1 hour

_background_task = None


def _load_export_into_db():
    """
    Reads the just-written exported_output_stage3/ files (the same
    directory orchestrate.EXPORT_DIR points at) into SQLite. Real
    on-disk data, not re-derived here.

    Also records WHICH KIND of refresh this was — deliberately, not as
    an afterthought. orchestrate.py's own run_normalization_and_export()
    never invokes live Tavily/news-matching/Tier B (that's always been
    true, done separately by hand all session); left as-is per instruction
    rather than wiring in unattended recurring live-API spend, which is a
    bigger decision than this build's scope (see PROJECT_CONTEXT.md
    Section 7). That means a scheduler-triggered refresh silently
    produces a SMALLER, registry-only dataset unless this is tracked
    explicitly — so every load records last_registry_refresh (any
    successful load) and, separately, last_full_refresh_with_news (only
    when pipeline_stats.json's news_queries_run > 0 — a real, already-
    computed signal, not a new flag threaded through orchestrate.py).
    /stats and the frontend both surface the gap between the two loudly,
    not as a quiet footnote.
    """
    export_dir = orchestrate.EXPORT_DIR
    ranked_path = os.path.join(export_dir, "ranked_candidates.json")
    details_path = os.path.join(export_dir, "candidate_details.json")
    tentative_path = os.path.join(export_dir, "tentative_links.json")
    gaps_path = os.path.join(export_dir, "brwa_coverage_gaps.json")
    stats_path = os.path.join(export_dir, "pipeline_stats.json")

    if not (os.path.exists(ranked_path) and os.path.exists(details_path)):
        logger.warning("no export found at %s — nothing to load into the DB yet", export_dir)
        return {"loaded": False, "reason": f"no export at {export_dir}"}

    with open(ranked_path, encoding="utf-8") as f:
        ranked_rows = json.load(f)
    with open(details_path, encoding="utf-8") as f:
        details_by_id = json.load(f)
    tentative_links = []
    if os.path.exists(tentative_path):
        with open(tentative_path, encoding="utf-8") as f:
            tentative_links = json.load(f)
    brwa_gaps = {}
    if os.path.exists(gaps_path):
        with open(gaps_path, encoding="utf-8") as f:
            brwa_gaps = json.load(f)
    pipeline_stats = {}
    if os.path.exists(stats_path):
        with open(stats_path, encoding="utf-8") as f:
            pipeline_stats = json.load(f)

    db.replace_all(ranked_rows, details_by_id, tentative_links, brwa_gaps)

    now = datetime.now(timezone.utc).isoformat()
    db.set_meta("last_loaded_at", now)
    db.set_meta("last_registry_refresh", now)
    was_rich = bool(pipeline_stats.get("news_queries_run", 0) > 0)
    if was_rich:
        db.set_meta("last_full_refresh_with_news", now)
        logger.info("load was a RICH refresh (news_queries_run=%s) — last_full_refresh_with_news updated",
                    pipeline_stats.get("news_queries_run"))
    else:
        logger.warning("load was a REGISTRY-ONLY refresh (no live news/Tier B) — "
                        "last_full_refresh_with_news NOT updated, dataset is now drifting from its last rich state")

    return {"loaded": True, "candidate_count": len(ranked_rows), "was_rich_refresh": was_rich}


def seed_if_empty():
    """
    On first startup, if the DB is empty, seed it from
    backend/exported_output_stage3/ (already-verified real data — the
    full 145-candidate live-Tavily run, with outreach/citations/bilingual
    already computed) rather than re-running the full pipeline, which
    would spend live Tavily calls unnecessarily and lose the currently-
    correct richer state for no reason.
    """
    if not db.is_empty():
        logger.info("DB already has %d candidates — skipping seed", db.candidate_count())
        return {"seeded": False, "reason": "DB not empty"}
    result = _load_export_into_db()
    logger.info("seeded DB from %s: %s", orchestrate.EXPORT_DIR, result)
    return {"seeded": True, **result}


def run_refresh_cycle(force: set = None, skip_scrape: bool = False) -> dict:
    """
    Same sequence as orchestrate.main() (freeze gate -> freshness check ->
    scrape due sources -> re-check freshness -> run_normalization_and_
    export), reusing those exact functions, plus loading the result into
    SQLite at the end. Returns a JSON-serializable summary; never raises
    for an expected "frozen" outcome, callers check result["status"].
    """
    force = force or set()
    today = date.today()

    if not skip_scrape:
        frozen = orchestrate.read_freeze()
        if frozen:
            logger.info("refresh cycle blocked — data frozen: %s", frozen.get("reason"))
            return {"status": "frozen", "frozen_at": frozen.get("frozen_at"), "reason": frozen.get("reason")}

    freshness = orchestrate.check_all_freshness(today)
    scrape_results = {}
    if not skip_scrape:
        for source in ("sruk", "srn_ppi", "verra", "brwa"):
            due, why = orchestrate.is_due(source, freshness, force)
            if not due:
                scrape_results[source] = {"ran": False, "why": why}
                continue
            ok, message = orchestrate.run_scraper(source)
            scrape_results[source] = {"ran": True, "ok": ok, "message": message}
        freshness = orchestrate.check_all_freshness(today)  # re-check after scraping

    pipeline_result = orchestrate.run_normalization_and_export(freshness)
    load_result = _load_export_into_db()

    return {
        "status": "ok",
        "scrape_results": scrape_results,
        "pipeline_stats": pipeline_result["stats"],
        "export": pipeline_result["export"],
        "db_load": load_result,
    }


async def _background_loop():
    while True:
        try:
            logger.info("scheduler: checking cadence...")
            result = run_refresh_cycle()
            logger.info("scheduler: cycle result status=%s", result.get("status"))
        except Exception:
            logger.exception("scheduler: refresh cycle failed, will retry next interval")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def start_background_scheduler():
    global _background_task
    if _background_task is None:
        _background_task = asyncio.create_task(_background_loop())
    return _background_task


def stop_background_scheduler():
    global _background_task
    if _background_task is not None:
        _background_task.cancel()
        _background_task = None
