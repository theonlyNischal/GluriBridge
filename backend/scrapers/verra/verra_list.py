"""
verra_list.py
=============
Handles the "list" side of the Verra VCS monthly crawl:

  - Loading the manually-downloaded Verra_Projects.xlsx (Export All) into a
    normalized list of dicts, regardless of exact column naming
    (Verra's export headers shift occasionally between "Project ID"/"ID",
    "Proponent"/"Proponents", etc.)
  - Filtering to AFOLU-relevant projects *before* any detail scraping happens
    (per spec: "check Sectoral Scope from your existing Excel export first,
    and only browser-scrape the IDs you already know are relevant")
  - Diffing this month's list against last month's stored list.csv to
    produce new_ids / removed_ids / status_changed / refresh_ids

No network or browser calls happen in this module -- it's pure
spreadsheet + diff logic, so it's fully unit-testable offline.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Optional

import pandas as pd

# Canonical field name -> list of header variants seen (or plausibly seen)
# in Verra's "Export (All)" CSV/XLSX across redesigns. Matching is
# case-insensitive and whitespace-tolerant.
COLUMN_ALIASES: dict[str, list[str]] = {
    "project_id": ["project id", "id", "vcs id", "vcs project id"],
    "name": ["name", "project name", "title"],
    "status": ["status", "project status"],
    "proponent": ["proponent", "proponents", "project proponent"],
    "authorized_rep_org": [
        "authorized representative organization name",
        "authorized representative org",
        "authorized_representative_org",
    ],
    "country": ["country"],
    "region": ["region"],
    "state": ["state", "state/province", "province"],
    "sectoral_scope": ["sectoral scope", "sector", "sectoral scopes"],
    "afolu_activities": [
        "afolu activities", "afolu activity",
        # Confirmed real header from a live export -- Verra's report-builder
        # names this column after its internal field path rather than a
        # human label. Kept as an exact alias since it's what actually
        # appears; add further variants here if a future export renames it.
        "public_view_reports_projects.pubreportsprojectslist.afoluactivities",
    ],
    "methodology": ["methodology", "methodology/protocol"],
    "estimated_annual_reductions": [
        "estimated annual emission reductions",
        "estimated average annual emission reductions",
        "estimated annual ghg emission reductions",
        # Confirmed real header (includes the CDR clause Verra added):
        "estimated average annual emission reductions and carbon dioxide removals",
    ],
    "estimated_start_date": ["estimated project start date", "estimated start date"],
    "registration_date": [
        "registration date", "date registered",
        "project registration date",  # confirmed real header
    ],
    "crediting_period_start": [
        "crediting period start date", "crediting period start",
        "crediting period duration start date",  # confirmed real header
    ],
    "crediting_period_end": [
        "crediting period end date", "crediting period end",
        "crediting period duration end date",  # confirmed real header
    ],
    "crediting_period_term": ["crediting period term"],
    "validator": ["validator", "validation/verification body", "vvb"],
}

AFOLU_KEYWORDS = ["afolu", "agriculture", "forestry", "land use"]


def _normalize_header(h: str) -> str:
    return " ".join(str(h).strip().lower().split())


def _resolve_columns(df: pd.DataFrame) -> dict[str, str]:
    """Maps canonical field name -> actual dataframe column name, for
    whichever aliases are present. Fields with no match are simply absent
    from the returned dict (callers must handle missing fields as None)."""
    normalized_to_actual = {_normalize_header(c): c for c in df.columns}
    resolved = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized_to_actual:
                resolved[canonical] = normalized_to_actual[alias]
                break
    return resolved


def load_project_list(xlsx_path: Path) -> list[dict[str, Any]]:
    """
    Loads Verra_Projects.xlsx (the manually-downloaded Export (All)) into a
    list of dicts with both:
      - normalized canonical fields (project_id, name, status, ...) where a
        matching column was found
      - the full original row under "raw" (nothing is discarded, so a field
        we didn't think to alias is still preserved for the normalizer/QA)
    """
    df = pd.read_excel(xlsx_path, dtype=str).fillna("")
    col_map = _resolve_columns(df)

    if "project_id" not in col_map:
        raise ValueError(
            f"Could not find a Project ID column in {xlsx_path}. "
            f"Columns found: {list(df.columns)}. "
            f"Add the actual header to COLUMN_ALIASES['project_id'] in verra_list.py."
        )

    rows = []
    for _, row in df.iterrows():
        record = {"raw": row.to_dict()}
        for canonical, actual_col in col_map.items():
            record[canonical] = row[actual_col]
        record.setdefault("project_id", None)
        rows.append(record)

    return rows


def is_afolu(record: dict[str, Any]) -> bool:
    """
    True if this project's Sectoral Scope or AFOLU Activities field mentions
    AFOLU/agriculture/forestry/land use. Per spec: filter *before* scraping,
    not after, to avoid wasting a scrape on e.g. a hydro project.

    If neither field is present at all (export doesn't include them), this
    returns True (fail open) rather than silently dropping every project --
    it's safer to scrape too much than to silently exclude everything
    because of a column-naming mismatch. A warning should be logged by the
    caller in that case.
    """
    scope = str(record.get("sectoral_scope") or "").lower()
    afolu = str(record.get("afolu_activities") or "").lower()
    if not scope and not afolu:
        return True  # fail open -- see docstring
    combined = f"{scope} {afolu}"
    return any(kw in combined for kw in AFOLU_KEYWORDS)


def filter_afolu(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
    """Returns (filtered_rows, had_sectoral_data). had_sectoral_data is False
    if no row had any sectoral scope/AFOLU info at all -- signals the caller
    to warn that the filter is a no-op this run."""
    had_data = any(r.get("sectoral_scope") or r.get("afolu_activities") for r in rows)
    filtered = [r for r in rows if is_afolu(r)]
    return filtered, had_data


def save_list_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["project_id", "name", "status", "proponent", "country",
                  "sectoral_scope", "afolu_activities", "methodology"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def load_previous_list(path: Optional[Path]) -> dict[str, dict[str, Any]]:
    """Loads a previous run's list.csv into {project_id: row_dict}. Returns
    {} if path is None or doesn't exist (first-ever run)."""
    if path is None or not path.exists():
        return {}
    out = {}
    with open(path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pid = row.get("project_id")
            if pid:
                out[pid] = row
    return out


def diff_lists(
    current_rows: list[dict[str, Any]],
    previous_by_id: dict[str, dict[str, Any]],
) -> dict[str, list[str]]:
    """
    Compares this month's filtered list against last month's, returning:
      new_ids, removed_ids, status_changed_ids, unchanged_ids
    """
    current_by_id = {str(r["project_id"]): r for r in current_rows if r.get("project_id")}
    current_ids = set(current_by_id.keys())
    previous_ids = set(previous_by_id.keys())

    new_ids = sorted(current_ids - previous_ids)
    removed_ids = sorted(previous_ids - current_ids)

    status_changed = []
    unchanged = []
    for pid in sorted(current_ids & previous_ids):
        cur_status = str(current_by_id[pid].get("status") or "")
        prev_status = str(previous_by_id[pid].get("status") or "")
        if cur_status != prev_status:
            status_changed.append(pid)
        else:
            unchanged.append(pid)

    return {
        "new_ids": new_ids,
        "removed_ids": removed_ids,
        "status_changed_ids": status_changed,
        "unchanged_ids": unchanged,
    }
