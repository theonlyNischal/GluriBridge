"""
SQLite storage — backend/gluribridge.db. One row per final candidate, the
full detail_view() JSON blob as a column (nothing trimmed — scoring, all
25 compliance rules' status not just the top badge, dossier, bilingual
outreach, BRWA evidence, citations, identity_resolution merge history all
survive intact), plus indexed columns for fast querying. tentative_links
and brwa_coverage_gaps get their own tables — queryable, not thrown away.

This module only stores and retrieves already-computed data. It never
computes a score, a citation, or anything else — same "assembly layer,
not a new source of truth" discipline as export.py.
"""
import json
import os
import sqlite3
from contextlib import contextmanager

# score_label() is a pure, additive function of need_score/credibility_score
# (see its docstring in gluribridge/export.py) — reused here rather than
# duplicated, since _detail_to_list_row() rebuilds the list-row shape from
# detail_json instead of storing export.py's list_row() output directly.
# Not stored in detail_json itself: the candidate-detail page deliberately
# shows no label, only the two real numbers (see export.py's detail_view()
# scoring-block comment), so this stays list-row-only, computed at read time.
from gluribridge.export import score_label

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gluribridge.db")
DB_PATH = os.path.abspath(DB_PATH)

SCHEMA = """
CREATE TABLE IF NOT EXISTS candidates (
    candidate_id TEXT PRIMARY KEY,
    name TEXT,
    org TEXT,
    province TEXT,
    data_richness TEXT,
    compliance_badge TEXT,
    primary_source TEXT,
    need_score REAL,
    credibility_score REAL,
    has_resolved_contact INTEGER,
    document_count INTEGER,
    detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_need ON candidates(need_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_cred ON candidates(credibility_score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_richness ON candidates(data_richness);
CREATE INDEX IF NOT EXISTS idx_candidates_badge ON candidates(compliance_badge);
CREATE INDEX IF NOT EXISTS idx_candidates_source ON candidates(primary_source);

CREATE TABLE IF NOT EXISTS tentative_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_a TEXT,
    candidate_b TEXT,
    score REAL,
    link_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brwa_coverage_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT,
    gaps_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Deliberately NOT touched by replace_all(). candidates/tentative_links/
-- brwa_coverage_gaps are wiped and reloaded fresh on every refresh (registry-
-- only or rich) — a real, user-set outreach status must survive that, so
-- it lives in its own table, keyed by candidate_id, joined onto candidate
-- responses at read time rather than stored redundantly in detail_json.
--
-- Replaces the original single-boolean `contacted`/`contacted_at` shape
-- (2026-08-27) with a real 5-value status enum (not_contacted/contacted/
-- follow_up_needed/done/rejected) — see VALID_STATUSES below. A live DB
-- created under the old schema is migrated by _migrate_legacy_candidate_
-- status()/_backfill_candidate_status_from_legacy(), not silently
-- recreated, since real user-set data (a real `contacted=1` row, and a
-- real note attached to a candidate that was never marked contacted) was
-- already sitting in the old table when this changed.
CREATE TABLE IF NOT EXISTS candidate_status (
    candidate_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'not_contacted',
    status_changed_at TEXT,
    note TEXT
);

-- One row per REAL recorded status transition (never a synthetic/
-- backfilled guess — see the migration functions below for why some
-- legacy rows intentionally produce zero history rows). This is what
-- "a timestamp per status change" actually requires; the single
-- `status_changed_at` column above only ever holds the latest one.
CREATE TABLE IF NOT EXISTS candidate_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id TEXT NOT NULL,
    status TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_status_history_candidate ON candidate_status_history(candidate_id, changed_at);
"""

VALID_STATUSES = {"not_contacted", "contacted", "follow_up_needed", "done", "rejected"}


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        _migrate_legacy_candidate_status(conn)
        conn.executescript(SCHEMA)
        _backfill_candidate_status_from_legacy(conn)


def _migrate_legacy_candidate_status(conn):
    """
    Renames the OLD candidate_status table (candidate_id, contacted,
    contacted_at, notes) out of the way, BEFORE the new-shape CREATE TABLE
    IF NOT EXISTS below runs — that clause only skips creation when a table
    of that name already exists, it does not alter columns, so without this
    rename a pre-existing old-schema table would silently stay in the old
    shape forever. No-op on a fresh DB (table doesn't exist yet) or one
    already migrated (has a `status` column).
    """
    cols = [r[1] for r in conn.execute("PRAGMA table_info(candidate_status)").fetchall()]
    if not cols or "status" in cols:
        return
    conn.execute("ALTER TABLE candidate_status RENAME TO candidate_status_v1_backup")


def _backfill_candidate_status_from_legacy(conn):
    """
    Restores real data from the renamed legacy table into the new schema.
    Runs after SCHEMA creates the fresh candidate_status/candidate_status_
    history tables. Guarded to run at most once (checks the new table is
    still empty) so repeated init_db() calls in the same process (tests do
    this) never double-insert.
    """
    legacy_exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='candidate_status_v1_backup'"
    ).fetchone()
    if not legacy_exists:
        return
    already_done = conn.execute("SELECT COUNT(*) AS n FROM candidate_status").fetchone()["n"]
    if already_done:
        return
    legacy_rows = conn.execute(
        "SELECT candidate_id, contacted, contacted_at, notes FROM candidate_status_v1_backup"
    ).fetchall()
    for row in legacy_rows:
        new_status = "contacted" if row["contacted"] else "not_contacted"
        conn.execute(
            "INSERT INTO candidate_status (candidate_id, status, status_changed_at, note) VALUES (?, ?, ?, ?)",
            (row["candidate_id"], new_status, row["contacted_at"], row["notes"]),
        )
        # Only a REAL recorded transition (contacted=1, with the real
        # original timestamp) becomes a real history row. A candidate that
        # was only ever contacted=0 never had an actual state-change event
        # under the old model — even one real case found in the live DB
        # carries a note ("Reached out via email...") without the flag
        # ever being flipped — so no synthetic history entry is invented
        # for a timestamp that was never recorded; the note itself is
        # still preserved in candidate_status above, just with no history
        # row backing it.
        if row["contacted"]:
            conn.execute(
                "INSERT INTO candidate_status_history (candidate_id, status, changed_at, note) VALUES (?, ?, ?, ?)",
                (row["candidate_id"], new_status, row["contacted_at"], row["notes"]),
            )


def is_empty() -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM candidates").fetchone()
        return row["n"] == 0


def replace_all(ranked_rows: list, details_by_id: dict, tentative_links: list, brwa_coverage_gaps: dict):
    """
    Full replace, not an incremental upsert — matches how export_pipeline_
    result() itself works (writes the whole file fresh each run). A
    partial/incremental sync here would risk stale rows lingering after a
    candidate disappears from a fresh run (e.g. a filter now excludes it).
    """
    with get_conn() as conn:
        conn.execute("DELETE FROM candidates")
        conn.execute("DELETE FROM tentative_links")
        conn.execute("DELETE FROM brwa_coverage_gaps")

        for row in ranked_rows:
            cid = row["candidate_id"]
            detail = details_by_id.get(cid)
            if detail is None:
                continue
            sources = row.get("sources") or []
            primary_source = sources[0] if sources else None
            conn.execute(
                """INSERT INTO candidates
                   (candidate_id, name, org, province, data_richness, compliance_badge,
                    primary_source, need_score, credibility_score, has_resolved_contact,
                    document_count, detail_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (cid, row.get("name"), row.get("org"), row.get("province"),
                 row.get("data_richness"), row.get("compliance_badge"), primary_source,
                 row.get("need_score"), row.get("credibility_score"),
                 int(bool(row.get("has_resolved_contact"))), row.get("document_count"),
                 json.dumps(detail, default=str, ensure_ascii=False)),
            )

        for link in tentative_links:
            conn.execute(
                "INSERT INTO tentative_links (candidate_a, candidate_b, score, link_json) VALUES (?, ?, ?, ?)",
                (link.get("candidate_a"), link.get("candidate_b"), link.get("score"),
                 json.dumps(link, default=str, ensure_ascii=False)),
            )

        for candidate_name, gaps in (brwa_coverage_gaps or {}).items():
            conn.execute(
                "INSERT INTO brwa_coverage_gaps (candidate_name, gaps_json) VALUES (?, ?)",
                (candidate_name, json.dumps(gaps, default=str, ensure_ascii=False)),
            )


def set_meta(key: str, value: str):
    with get_conn() as conn:
        conn.execute("INSERT INTO meta (key, value) VALUES (?, ?) "
                     "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))


def get_meta(key: str, default=None):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


# Same display-only tiebreaker as export.py's export_pipeline_result() —
# need_score desc, credibility_score desc, has_resolved_contact desc,
# document_count desc. Never a scoring input, purely presentation order.
DEFAULT_ORDER = "need_score DESC, credibility_score DESC, has_resolved_contact DESC, document_count DESC"
SORTABLE_COLUMNS = {"need_score", "credibility_score"}


def list_candidates(sort_by: str = None) -> list:
    order = DEFAULT_ORDER
    if sort_by:
        if sort_by not in SORTABLE_COLUMNS:
            raise ValueError(f"sort_by must be one of {sorted(SORTABLE_COLUMNS)}")
        order = f"{sort_by} DESC"
    with get_conn() as conn:
        rows = conn.execute(f"SELECT detail_json FROM candidates ORDER BY {order}").fetchall()
        statuses = _all_statuses(conn)
    # The list endpoint returns the SAME list_row() shape the frontend
    # already expects — reconstructed from the full detail_json rather
    # than stored twice, so there's exactly one place a candidate's data
    # actually lives.
    out = []
    for r in rows:
        d = json.loads(r["detail_json"])
        out.append(_detail_to_list_row(d, statuses.get(d["candidate_id"])))
    return out


def _detail_to_list_row(d: dict, status: dict = None) -> dict:
    idn = d["identity"]
    sc = d["scoring"]
    contact = d.get("contact")
    status = status or {"status": "not_contacted", "status_changed_at": None, "note": None}
    return {
        "candidate_id": d["candidate_id"],
        "name": idn["name"], "org": idn["org"], "province": idn["province"],
        "district": idn["district"], "country": idn["country"], "sector": idn["sector"],
        "sources": [m["source"] for m in d["identity_resolution"]["merge_history"]],
        "data_richness": idn["data_richness"], "verification_status": idn["verification_status"],
        "need_score": sc["need_score"], "credibility_score": sc["credibility_score"],
        "credibility_capped": sc["credibility_capped"], "compliance_badge": sc["compliance"]["badge"],
        "score_label": score_label(sc["need_score"], sc["credibility_score"]),
        "has_brwa_evidence": d["land_rights"]["brwa_overlap"] is not None,
        "brwa_idx": d["land_rights"]["brwa_overlap"]["brwa_idx"] if d["land_rights"]["brwa_overlap"] else None,
        "land_rights_category": d["land_rights"]["land_rights_category"],
        "has_named_contact": bool(contact and contact.get("name")),
        "has_resolved_contact": bool(contact and contact.get("contact_source")),
        # Distinct from has_resolved_contact on purpose (2026-08-31 audit) —
        # "resolved contact" is true for a Tier A registrant NAME with no
        # email at all (the overwhelming majority: 83 of 144 real
        # candidates), which is NOT "ready for outreach" the way the
        # Dashboard's summary sentence used to imply.
        #
        # has_email requires contact_confidence == "high" specifically
        # (2026-08-31 follow-up) — a real, manual spot-check found one real
        # Tier B resolution (PT Pertamina, via a generic phe.pertamina.com
        # contact page) that's genuinely NOT a false positive (real domain,
        # real email, not a third party) but is only "medium" confidence
        # and not clearly tied to the specific candidate's own forestry
        # program, unlike the other three (all "high" confidence, each
        # confirmed via the org's own copyright-footer self-identification).
        # Counting it in the same "ready for outreach" bucket as those
        # three would overstate how solid that number is, so it's counted
        # separately below instead of silently dropped from the record —
        # the real email stays on file and visible on that candidate's own
        # page, just not in this confident aggregate.
        "has_email": bool(contact and contact.get("email") and contact.get("contact_confidence") == "high"),
        "has_low_confidence_email": bool(contact and contact.get("email") and contact.get("contact_confidence") != "high"),
        # Audit-trail flag (2026-08-31) — true only when a Tier B org-website
        # search was actually run for this candidate (see RegistrantContact.
        # contact_tier_b_attempted_at), distinguishing "never searched" from
        # "searched and found nothing" for the contact-readiness UI.
        "contact_tier_b_attempted": bool(contact and contact.get("contact_tier_b_attempted_at")),
        # Real activity-type classification (2026-08-31) — see
        # gluribridge/activity_type.py. activity_categories is always []
        # when activity_not_applicable is True; an empty list with
        # not_applicable False is the separate "unclassified" state —
        # the frontend must render these as two distinct honest states.
        "activity_categories": (d.get("activity_type") or {}).get("categories", []),
        "activity_not_applicable": bool((d.get("activity_type") or {}).get("not_applicable")),
        "document_count": len(d.get("documents") or []),
        "news_evidence_count": len(d.get("news_evidence") or []),
        "status": status["status"],
        "status_changed_at": status["status_changed_at"],
        "latitude": d.get("location", {}).get("latitude"),
        "longitude": d.get("location", {}).get("longitude"),
    }


def get_candidate_detail(candidate_id: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT detail_json FROM candidates WHERE candidate_id = ?",
                            (candidate_id,)).fetchone()
        if not row:
            return None
        status = _get_status(conn, candidate_id)
        status["history"] = get_status_history(candidate_id, conn=conn)
    detail = json.loads(row["detail_json"])
    # Additive — never overwrites anything export.py/citations.py/outreach.py
    # already computed, just attaches the persisted, refresh-surviving
    # status alongside it.
    detail["status"] = status
    return detail


def _get_status(conn, candidate_id: str) -> dict:
    row = conn.execute("SELECT status, status_changed_at, note FROM candidate_status WHERE candidate_id = ?",
                        (candidate_id,)).fetchone()
    if not row:
        return {"status": "not_contacted", "status_changed_at": None, "note": None}
    return {"status": row["status"], "status_changed_at": row["status_changed_at"], "note": row["note"]}


def _all_statuses(conn) -> dict:
    rows = conn.execute("SELECT candidate_id, status, status_changed_at, note FROM candidate_status").fetchall()
    return {r["candidate_id"]: {"status": r["status"], "status_changed_at": r["status_changed_at"],
                                 "note": r["note"]} for r in rows}


def set_status(candidate_id: str, status: str, note: str = None, timestamp: str = None) -> dict:
    """
    Upserts the current-state row AND appends a real history row — but only
    when the status actually changes. Re-saving the same status (e.g. just
    to update the note) doesn't fabricate a new "transition" that never
    happened; the note still updates.
    """
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}, got {status!r}")
    with get_conn() as conn:
        exists = conn.execute("SELECT 1 FROM candidates WHERE candidate_id = ?", (candidate_id,)).fetchone()
        if not exists:
            raise KeyError(candidate_id)
        current = _get_status(conn, candidate_id)
        changed = current["status"] != status
        conn.execute(
            """INSERT INTO candidate_status (candidate_id, status, status_changed_at, note)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(candidate_id) DO UPDATE SET
                 status = excluded.status,
                 status_changed_at = CASE WHEN excluded.status != candidate_status.status
                                          THEN excluded.status_changed_at
                                          ELSE candidate_status.status_changed_at END,
                 note = COALESCE(excluded.note, candidate_status.note)""",
            (candidate_id, status, timestamp, note),
        )
        if changed:
            conn.execute(
                "INSERT INTO candidate_status_history (candidate_id, status, changed_at, note) VALUES (?, ?, ?, ?)",
                (candidate_id, status, timestamp, note),
            )
        result = _get_status(conn, candidate_id)
        result["history"] = get_status_history(candidate_id, conn=conn)
        return result


def get_status_history(candidate_id: str, conn=None) -> list:
    def _query(c):
        rows = c.execute(
            "SELECT status, changed_at, note FROM candidate_status_history WHERE candidate_id = ? ORDER BY changed_at ASC",
            (candidate_id,),
        ).fetchall()
        return [{"status": r["status"], "changed_at": r["changed_at"], "note": r["note"]} for r in rows]

    if conn is not None:
        return _query(conn)
    with get_conn() as c:
        return _query(c)


def get_tentative_links() -> list:
    with get_conn() as conn:
        rows = conn.execute("SELECT link_json FROM tentative_links").fetchall()
    return [json.loads(r["link_json"]) for r in rows]


def get_brwa_coverage_gaps() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT candidate_name, gaps_json FROM brwa_coverage_gaps").fetchall()
    return {r["candidate_name"]: json.loads(r["gaps_json"]) for r in rows}


def candidate_count() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM candidates").fetchone()["n"]
