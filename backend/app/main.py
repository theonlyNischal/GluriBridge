"""
GluriBridge FastAPI service. Run from backend/:
    uvicorn app.main:app --reload

Serves the same data the frontend was reading from static
exported_output_stage3/ files, now from SQLite (backend/gluribridge.db),
kept fresh by a background scheduler that reuses orchestrate.py's
existing cadence/freeze logic unchanged.
"""
import logging
import os
import sys

# Must happen before any sibling-module import that itself imports
# orchestrate/gluribridge (scheduler.py, routes.py) — orchestrate.py and
# the gluribridge package both live one level up from this file (backend/
# is their shared parent), so backend/ needs to be on sys.path before
# those imports execute, regardless of how uvicorn was invoked (bare
# `uvicorn app.main:app`, `python -m uvicorn ...`, or a test importing
# this module directly).
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

# Loads the repo-root .env into os.environ if present (2026-09-03, added
# for the Sync page's optional TAVILY_API_KEY) — repo-root, not
# backend/.env, matching the project's own existing .env/.env.example
# convention (found already in place at the repo root, alongside
# NVIDIA_API_KEY, while wiring this up — not something introduced here).
# Silently a no-op if no .env file exists, so this is safe for every
# existing deployment/dev setup that's never needed one. Must happen
# before orchestrate.py (imported by scheduler/routes below) ever reads
# os.environ for the key.
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_ROOT, "..", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import db, scheduler
from app.routes import router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="GluriBridge API",
    description="Indonesia forestry-carbon partner discovery — ranked candidates, dossiers, "
                 "bilingual outreach, and real source citations.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local demo — no auth/deployment hardening in scope here
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.on_event("startup")
async def on_startup():
    db.init_db()
    seed_result = scheduler.seed_if_empty()
    logging.getLogger("gluribridge.startup").info("seed_if_empty: %s", seed_result)
    scheduler.start_background_scheduler()


@app.on_event("shutdown")
async def on_shutdown():
    scheduler.stop_background_scheduler()


@app.get("/")
def root():
    return {
        "service": "GluriBridge API",
        "candidate_count": db.candidate_count(),
        "docs": "/docs",
    }
