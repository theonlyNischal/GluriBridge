"""
FastAPI routes — v1. Every response is either data already sitting in
SQLite (itself sourced from real detail_view()/export_pipeline_result()
output — nothing computed here) or a pass-through to orchestrate.py's
existing freeze/freshness readers. No new facts, same "assembly only"
discipline as export.py.
"""
import json
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

import orchestrate
from . import db, scheduler, territories

router = APIRouter()


class StatusUpdate(BaseModel):
    status: str  # one of db.VALID_STATUSES — validated in db.set_status()
    note: str | None = None


def _get_detail_or_404(candidate_id: str) -> dict:
    detail = db.get_candidate_detail(candidate_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"no candidate with id {candidate_id!r}")
    return detail


@router.get("/candidates")
def list_candidates(sort_by: str = Query(None, description="need_score or credibility_score; omit for the default display-order-only tiebreaker")):
    try:
        return db.list_candidates(sort_by=sort_by)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/candidates/{candidate_id}")
def get_candidate(candidate_id: str):
    return _get_detail_or_404(candidate_id)


@router.get("/candidates/{candidate_id}/dossier")
def get_candidate_dossier(candidate_id: str):
    return _get_detail_or_404(candidate_id)["dossier"]


@router.get("/candidates/{candidate_id}/outreach")
def get_candidate_outreach(candidate_id: str):
    return _get_detail_or_404(candidate_id)["outreach"]


@router.get("/candidates/{candidate_id}/citations")
def get_candidate_citations(candidate_id: str):
    """
    Every reason's citation in one place — the same {source_type, url,
    retrieved_at, note} objects already attached by citations.py, not
    re-derived here. Includes the land-rights citation too, which lives
    on the dossier rather than the scoring block.
    """
    detail = _get_detail_or_404(candidate_id)
    sc = detail["scoring"]
    return {
        "candidate_id": candidate_id,
        "need_detection_reasons": [
            {"rule": r["rule"], "text": r["text"], "citation": r["citation"]}
            for r in sc["need_detection_reasons"]
        ],
        "credibility_components": {
            key: [{"text": r["text"], "citation": r["citation"]} for r in comp["reasons"]]
            for key, comp in sc["credibility_components"].items()
        },
        "land_rights_citation": detail["dossier"]["structured"]["land_and_regulatory"]["land_rights_citation"],
    }


@router.get("/tentative-links")
def get_tentative_links():
    return db.get_tentative_links()


@router.get("/brwa-coverage-gaps")
def get_brwa_coverage_gaps():
    return db.get_brwa_coverage_gaps()


@router.get("/stats")
def get_stats():
    stats_path = os.path.join(orchestrate.EXPORT_DIR, "pipeline_stats.json")
    pipeline_stats = None
    if os.path.exists(stats_path):
        with open(stats_path, encoding="utf-8") as f:
            pipeline_stats = json.load(f)

    # Deliberately loud, not a quiet footnote: orchestrate.py's own
    # pipeline call never includes live Tavily/Tier B (a real, pre-
    # existing gap — see PROJECT_CONTEXT.md Section 7), so an automated
    # scheduler refresh silently produces a smaller, registry-only
    # dataset unless this is surfaced explicitly. last_registry_refresh
    # updates on every successful load; last_full_refresh_with_news only
    # updates when that load actually included live news/Tier B.
    last_registry_refresh = db.get_meta("last_registry_refresh")
    last_full_refresh_with_news = db.get_meta("last_full_refresh_with_news")
    news_data_stale = False
    news_data_stale_message = None
    if last_registry_refresh and not last_full_refresh_with_news:
        news_data_stale = True
        news_data_stale_message = ("No refresh with live news/Tier B enrichment has ever been recorded — "
                                    "this dataset is registry-only.")
    elif last_registry_refresh and last_full_refresh_with_news and last_registry_refresh > last_full_refresh_with_news:
        news_data_stale = True
        news_data_stale_message = (
            f"The live dataset was refreshed at {last_registry_refresh} WITHOUT live news/Tier B "
            f"enrichment — news-discovered candidates and Tier B contacts reflect the last rich "
            f"refresh at {last_full_refresh_with_news}, not the current registry state."
        )

    return {
        "pipeline_stats": pipeline_stats,
        "candidate_count_in_db": db.candidate_count(),
        "freshness": orchestrate.check_all_freshness(date.today()),
        "freeze": orchestrate.read_freeze(),  # null when not frozen
        "last_db_load_at": db.get_meta("last_loaded_at"),
        "last_registry_refresh": last_registry_refresh,
        "last_full_refresh_with_news": last_full_refresh_with_news,
        "brwa_territories": territories.count_stats(),  # real {total, with_geometry} — see territories.count_stats()
        "news_data_stale": news_data_stale,
        "news_data_stale_message": news_data_stale_message,
        # Real, live check (2026-09-03, Sync page) — not cached — so the
        # frontend can grey out the news-enriched refresh option BEFORE a
        # click, rather than only finding out from a failed request.
        "tavily_configured": orchestrate.get_tavily_api_key() is not None,
    }


VALID_SOURCES = ("sruk", "srn_ppi", "verra", "brwa")


@router.post("/refresh", status_code=202)
def post_refresh(
    background_tasks: BackgroundTasks,
    force: str = Query("", description="comma-separated source names to force regardless of cadence, same as orchestrate.py --force"),
    with_news: bool = Query(False, description="also run live Tavily news discovery + Tier B contact resolution — requires TAVILY_API_KEY configured on the backend"),
    only: str = Query(None, description="restrict to exactly one source (sruk/srn_ppi/verra/brwa), always run regardless of cadence — Sync page per-source buttons"),
):
    """
    Fire-and-forget (2026-09-03, Sync page live progress) — a full
    refresh (real scraping + optionally real Tavily searches) can take
    several real minutes; blocking the request until it finished (the
    original design) left the frontend with nothing to show but one
    opaque spinner for that whole time. Returns 202 immediately once the
    cheap synchronous pre-checks pass; the actual work runs in a
    BackgroundTasks callback, with live per-source progress readable
    from GET /refresh-status while it runs, and the final real outcome
    landing in GET /refresh-log once it's done.

    The frozen/already-in-progress checks happen HERE, synchronously,
    not inside the backgrounded call — so a blocked request still fails
    fast with the real reason (423/409), rather than reporting "started"
    and only failing silently in the background.

    only (2026-09-03, individual per-source buttons): still runs the
    real full pipeline/export/load afterward (not just the one raw
    scrape) — a candidate list can't be re-scored from one source's
    data alone, the pipeline always needs all 4. with_news is ignored
    when only is set (news enrichment isn't scoped to one registry
    source — it's a pipeline-wide step using every current candidate's
    province, same reasoning as why news isn't a Sources table row at
    all).
    """
    if only is not None and only not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"only must be one of {VALID_SOURCES}, got {only!r}")

    if with_news and only is None and orchestrate.get_tavily_api_key() is None:
        # Deliberately a real 4xx, not a silent downgrade to registry-only —
        # the caller explicitly asked for a news-enriched refresh; doing
        # less than that without saying so would misreport what happened,
        # the same honesty standard every other real vs. simulated
        # decision in this app is held to.
        raise HTTPException(status_code=400, detail="with_news=true requested, but TAVILY_API_KEY is not configured on this backend — see the repo root's .env.example")

    current = scheduler.get_current_refresh()
    if current and current.get("in_progress"):
        raise HTTPException(status_code=409, detail={"message": "a refresh is already in progress", "current": current})

    frozen = orchestrate.read_freeze()
    if frozen:
        # 423 Locked — the closest standard status for "blocked by an
        # explicit hold," matching orchestrate.py CLI's own exit code 3
        # for the identical situation.
        raise HTTPException(status_code=423, detail={"status": "frozen", "frozen_at": frozen.get("frozen_at"), "reason": frozen.get("reason")})

    forced = {s.strip() for s in force.split(",") if s.strip()}
    background_tasks.add_task(
        scheduler.run_refresh_cycle, force=forced, with_news=(with_news and only is None), triggered_by="manual", only=only,
    )
    return {"status": "started"}


@router.get("/refresh-status")
def get_refresh_status():
    """Live progress of the currently-running refresh, if any — real
    state from scheduler._current_refresh, updated as run_refresh_cycle
    actually moves through each source/phase. null when nothing is
    running; the frontend polls this while a refresh is in flight."""
    return scheduler.get_current_refresh()


@router.get("/refresh-log")
def get_refresh_log(limit: int = Query(20, ge=1, le=100)):
    """Real refresh-attempt history for the Sync page's activity log — see
    db.get_refresh_log()'s own docstring. Most-recent-first."""
    return db.get_refresh_log(limit=limit)


@router.post("/candidates/{candidate_id}/status")
def set_candidate_status(candidate_id: str, body: StatusUpdate):
    """
    Persisted in its own table, deliberately never touched by a data
    refresh (registry-only or rich) — a real user action, not derived or
    computed data, so it must survive the candidates table being wiped
    and reloaded on every refresh cycle. Every real transition also appends
    a row to candidate_status_history (see db.set_status()) — a timestamp
    per status change, not just one overwritten "contacted_at".
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        return db.set_status(candidate_id, body.status, note=body.note, timestamp=timestamp)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"no candidate with id {candidate_id!r}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/territories")
def list_territories(search: str = Query(None), province: str = Query(None), limit: int = Query(200, le=2283)):
    """
    Lightweight list — name/province/policy_tier/has_geometry, never the
    polygon itself (1,756+ real geometries total ~149MB, never served in
    bulk). Fetch an individual territory's real geometry via
    GET /territories/{idx}/geometry once the user picks one.
    """
    return territories.list_territories(search=search, province=province, limit=limit)


@router.get("/territories/{idx}")
def get_territory(idx: str):
    t = territories.get_territory(idx)
    if t is None:
        raise HTTPException(status_code=404, detail=f"no territory with idx {idx!r}")
    return t


@router.get("/territories/{idx}/geometry")
def get_territory_geometry(idx: str):
    """Real GeoJSON, read directly from BRWA's own crawled geometry file —
    never generated or approximated. 404, honestly, when this specific
    territory has no geometry on file (confirmed real for ~23% of all
    1,756 — BRWA's own site genuinely has none for those, not a crawl gap;
    see PROJECT_CONTEXT.md Section 7)."""
    geom = territories.get_territory_geometry(idx)
    if geom is None:
        raise HTTPException(status_code=404, detail=f"no geometry on file for territory {idx!r}")
    return geom
