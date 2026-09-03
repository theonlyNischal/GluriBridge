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

# Live, in-memory refresh progress (2026-09-03, Sync page per-source
# progress) — deliberately NOT persisted: this is "what's happening
# right now," a different real thing from refresh_log (the durable
# history of past attempts) or the meta table (last-known-good
# timestamps). None when nothing is running. Fine for this app's
# single-worker uvicorn process; would need a shared store (e.g. Redis)
# to stay correct across multiple worker processes, out of scope here.
_current_refresh: dict | None = None


def get_current_refresh() -> dict | None:
    return _current_refresh


def _set_phase(phase: str, source: str = None, source_status: str = None):
    """Mutates the one shared _current_refresh dict in place — GET
    /refresh-status reads whatever's there at request time, no locking
    needed for this single-writer/many-readers pattern (the writer is
    always the one in-progress refresh; run_refresh_cycle's own
    in-progress guard, below, ensures there's never more than one)."""
    if _current_refresh is None:
        return
    _current_refresh["phase"] = phase
    if source:
        _current_refresh["source_status"][source] = source_status


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


def run_refresh_cycle(force: set = None, skip_scrape: bool = False, with_news: bool = False,
                       triggered_by: str = "scheduler") -> dict:
    """
    Same sequence as orchestrate.main() (freeze gate -> freshness check ->
    scrape due sources -> re-check freshness -> run_normalization_and_
    export), reusing those exact functions, plus loading the result into
    SQLite at the end. Returns a JSON-serializable summary; never raises
    for an expected "frozen" outcome, callers check result["status"].

    with_news (2026-09-03, Sync page): passed straight through to
    orchestrate.run_normalization_and_export() — see its own docstring.
    Defaults to False; the background loop below NEVER passes True, so
    the automatic cadence-based refresh stays registry-only exactly as
    it always has, regardless of whether a Tavily key is configured —
    news-enriched refreshes only ever happen from an explicit manual
    request (routes.py's POST /refresh?with_news=true).

    Every attempt — 'ok', 'frozen', or a genuine pipeline exception — is
    appended to the real refresh_log table (db.log_refresh_attempt), not
    just the two success-only meta timestamps. A pipeline exception is
    caught here rather than left to propagate: _load_export_into_db()
    then never runs, so the live DB's existing candidates table (and
    whatever the frontend is currently showing) is structurally
    untouched by a failed attempt — the real "last validated data stays
    up" behavior, achieved by simply never overwriting it on failure,
    not by any special-cased fallback logic.

    Live progress (2026-09-03): populates the module-level
    _current_refresh dict as it moves through each real step (per-source
    scraping, then the pipeline/export step), read by GET /refresh-status
    — real, caused by this function's actual state, never simulated or
    estimated. Also guards against overlap: if a refresh is ALREADY in
    progress (a real concurrency risk that existed before this guard too
    — a manual request could already collide with the hourly scheduler
    loop), a new call returns {"status": "skipped", ...} immediately
    rather than running two scrapes against the same data/raw/ files at
    once.
    """
    global _current_refresh
    if _current_refresh is not None and _current_refresh.get("in_progress"):
        logger.info("refresh cycle skipped — one is already in progress (started %s, by %s)",
                    _current_refresh.get("started_at"), _current_refresh.get("triggered_by"))
        return {"status": "skipped", "reason": "a refresh is already in progress", "current": dict(_current_refresh)}

    force = force or set()
    today = date.today()
    started_at = datetime.now(timezone.utc).isoformat()
    sources = ("sruk", "srn_ppi", "verra", "brwa")
    _current_refresh = {
        "in_progress": True,
        "started_at": started_at,
        "with_news": with_news,
        "triggered_by": triggered_by,
        "phase": "starting",
        "source_status": {s: "pending" for s in sources},
    }

    if not skip_scrape:
        frozen = orchestrate.read_freeze()
        if frozen:
            logger.info("refresh cycle blocked — data frozen: %s", frozen.get("reason"))
            db.log_refresh_attempt(started_at, datetime.now(timezone.utc).isoformat(), "frozen",
                                    with_news, False, triggered_by, detail=frozen.get("reason"))
            _current_refresh = None
            return {"status": "frozen", "frozen_at": frozen.get("frozen_at"), "reason": frozen.get("reason")}

    freshness = orchestrate.check_all_freshness(today)
    scrape_results = {}
    try:
        if not skip_scrape:
            for source in sources:
                due, why = orchestrate.is_due(source, freshness, force)
                if not due:
                    scrape_results[source] = {"ran": False, "why": why}
                    _set_phase(source, source, "skipped")
                    continue
                _set_phase(source, source, "running")
                ok, message = orchestrate.run_scraper(source)
                scrape_results[source] = {"ran": True, "ok": ok, "message": message}
                _set_phase(source, source, "done" if ok else "failed")
            freshness = orchestrate.check_all_freshness(today)  # re-check after scraping

        _set_phase("pipeline")
        pipeline_result = orchestrate.run_normalization_and_export(freshness, with_news=with_news)
        _set_phase("loading")
        load_result = _load_export_into_db()
    except Exception as e:
        logger.exception("refresh cycle failed")
        db.log_refresh_attempt(started_at, datetime.now(timezone.utc).isoformat(), "error",
                                with_news, False, triggered_by, detail=str(e))
        return {"status": "error", "message": str(e), "scrape_results": scrape_results}
    finally:
        # Runs after either the try block or the except block above —
        # covers both "finished" and "failed," always clears the live
        # in-progress flag exactly once so a genuine crash can never
        # leave the Sync page believing a refresh is still running.
        _current_refresh = None

    used_news = pipeline_result.get("used_news", False)
    db.log_refresh_attempt(
        started_at, datetime.now(timezone.utc).isoformat(), "ok", with_news, used_news, triggered_by,
        detail=f"{load_result['candidate_count']} candidates loaded" + (" (with news)" if used_news else ""),
    )
    return {
        "status": "ok",
        "scrape_results": scrape_results,
        "pipeline_stats": pipeline_result["stats"],
        "export": pipeline_result["export"],
        "db_load": load_result,
        "used_news": used_news,
    }


async def _background_loop():
    while True:
        try:
            logger.info("scheduler: checking cadence...")
            # asyncio.to_thread (2026-09-03, real bug found live) — this
            # was calling the synchronous, potentially many-minutes-long
            # run_refresh_cycle() directly on the event loop. FastAPI/
            # Starlette automatically runs a sync ROUTE handler in a
            # thread pool, but nothing does that for a plain function
            # called from inside an asyncio task — so every real request
            # (GET /stats, the Sync page itself, everything) was
            # completely unresponsive for the entire duration of any
            # automatic hourly refresh. Caught because this server had
            # finally run long enough for the scheduler's own first tick
            # to fire during active use — the server went unreachable at
            # exactly that moment, confirmed live, not hypothetical.
            result = await asyncio.to_thread(run_refresh_cycle)
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
