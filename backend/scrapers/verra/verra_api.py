"""
verra_api.py
=============
Direct API access to Verra project details -- no browser, no Playwright,
no cookie banners, no DOM scraping. The public registry site's own
frontend calls this same endpoint to render the project detail page; we
just call it directly.

Confirmed working (via curl, then verified against a real captured
payload):

    GET https://prod-us.api.platts.com/ci-raas-prod/br-reg/rest/public-report-manager/getProjectById/{vcs_id}/Markit
    Headers:
        Accept: application/json
        appkey: <APPKEY>
        application: Markit
        tenant: Verra
        standardacronym: VCS
        standardId: 150000000000001

The appkey is embedded in Verra's own frontend JS bundle (i.e. it's the
same access any browser visiting the public site gets, not a private
credential) but it can rotate. If every request starts failing with 401/403,
re-extract it: open the registry site, DevTools -> Network -> XHR, reload
a project page, find this same URL, and copy the `appkey` header value.
"""

from __future__ import annotations

import os
import random
import time
from typing import Any, Optional

import requests

BASE_URL = "https://prod-us.api.platts.com/ci-raas-prod/br-reg/rest/public-report-manager/getProjectById"
STATS_URL = "https://prod-us.api.platts.com/ci-raas-prod/raas-credit-api/mixed-unit-manager/public/getAllStatistics"

# Update this if requests start failing with 401/403 -- see module docstring.
# Overridable via VERRA_APPKEY, defaulting to the same real public value --
# it's embedded in Verra's own frontend JS bundle, not a private credential
# (see module docstring), so the default is safe to keep, but an env-var
# override still lets a rotated key be supplied without editing source.
APPKEY = os.environ.get("VERRA_APPKEY", "wOKHFGuxKApQaujPSKgF")

# standardId 150000000000001 = VCS. Kept as a named constant since the same
# endpoint likely supports Verra's other standards (CCB, SD VISta, Plan
# Vivo, etc.) with a different id/acronym pair, if that's ever needed.
STANDARD_ACRONYM = "VCS"
STANDARD_ID = "150000000000001"
APPLICATION = "Markit"
TENANT = "Verra"

DEFAULT_TIMEOUT = 30
DEFAULT_MAX_RETRIES = 3
DEFAULT_DELAY_RANGE = (1.0, 2.0)  # politeness delay between requests


class VerraAPIError(Exception):
    pass


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Accept": "application/json",
        "Content-Type": "application/json",
        "appkey": APPKEY,
        "application": APPLICATION,
        "tenant": TENANT,
        "standardacronym": STANDARD_ACRONYM,
        "standardId": STANDARD_ID,
    })
    return s


def polite_sleep(delay_range: tuple[float, float] = DEFAULT_DELAY_RANGE) -> None:
    time.sleep(random.uniform(*delay_range))


def fetch_project_detail(
    session: requests.Session,
    vcs_id: str,
    timeout: int = DEFAULT_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> dict[str, Any]:
    """
    Fetches the raw project detail JSON for a single VCS project ID.
    Retries on connection errors, timeouts, 429, and 5xx. Raises
    VerraAPIError (not retried) on 401/403 -- these almost always mean the
    appkey has rotated, and retrying won't help; on 404 -- the project ID
    doesn't exist under this standard.
    """
    url = f"{BASE_URL}/{vcs_id}/{APPLICATION}"
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        try:
            resp = session.get(url, timeout=timeout)

            if resp.status_code in (401, 403):
                raise VerraAPIError(
                    f"HTTP {resp.status_code} for project {vcs_id} -- the appkey has likely "
                    f"rotated. Re-extract it from the registry site's Network tab and update "
                    f"APPKEY in verra_api.py. (Not retrying -- retries won't fix an auth issue.)"
                )
            if resp.status_code == 404:
                raise VerraAPIError(f"Project {vcs_id} not found (HTTP 404) under standard {STANDARD_ACRONYM}.")

            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.exceptions.HTTPError(f"Retryable status {resp.status_code}", response=resp)

            resp.raise_for_status()
            data = resp.json()

            # The API can return a 200 with an empty/null body for an
            # invalid ID rather than a proper 404 -- treat that as an
            # error too rather than silently "succeeding" with nothing.
            if not data:
                raise VerraAPIError(f"Project {vcs_id}: API returned 200 with empty body.")

            return data

        except VerraAPIError:
            raise  # don't retry auth/not-found errors
        except requests.exceptions.HTTPError as e:
            last_exc = e
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, ValueError) as e:
            last_exc = e

        if attempt < max_retries:
            backoff = min(60.0, 1.5 * (2 ** attempt)) + random.uniform(0, 1.0)
            time.sleep(backoff)

    raise VerraAPIError(f"Exhausted {max_retries + 1} attempts fetching project {vcs_id}: {last_exc}")


def fetch_project_statistics(
    session: requests.Session,
    internal_project_id: int | str,
    standard_id: str = STANDARD_ID,
    timeout: int = DEFAULT_TIMEOUT,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> dict[str, Any]:
    """
    Fetches real unit/VCU statistics (issued/active/retired/buffer/cancelled)
    for a project. Unlike getProjectById, this takes the project's INTERNAL
    numeric id (e.g. 110200000008277) -- NOT the public VCS number (e.g.
    "538") -- so callers must fetch project detail first and pass in
    `detail_json["project_id"]`.

    Returns the raw response dict; callers should read
    `result["quantitiesByStateCode"]` for the actual figures, e.g.:
        {"Buffer": 0, "Active": 138703, "Retired": 45037,
         "Issued": 183740, "Unit_Cancelled": 0}

    Same retry semantics as fetch_project_detail: no retry on 401/403/404,
    backoff retry on 429/5xx/connection errors.
    """
    last_exc: Optional[Exception] = None
    body = {"standard_id": int(standard_id), "project_id": int(internal_project_id)}

    for attempt in range(max_retries + 1):
        try:
            resp = session.post(STATS_URL, json=body, timeout=timeout)

            if resp.status_code in (401, 403):
                raise VerraAPIError(
                    f"HTTP {resp.status_code} fetching stats for internal project "
                    f"{internal_project_id} -- appkey likely rotated, see verra_api.py."
                )
            if resp.status_code == 404:
                raise VerraAPIError(f"Stats endpoint 404 for internal project {internal_project_id}.")
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.exceptions.HTTPError(f"Retryable status {resp.status_code}", response=resp)

            resp.raise_for_status()
            data = resp.json()
            if not data:
                raise VerraAPIError(f"Stats endpoint returned 200 with empty body for {internal_project_id}.")
            return data

        except VerraAPIError:
            raise
        except requests.exceptions.HTTPError as e:
            last_exc = e
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, ValueError) as e:
            last_exc = e

        if attempt < max_retries:
            backoff = min(60.0, 1.5 * (2 ** attempt)) + random.uniform(0, 1.0)
            time.sleep(backoff)

    raise VerraAPIError(
        f"Exhausted {max_retries + 1} attempts fetching stats for internal project "
        f"{internal_project_id}: {last_exc}"
    )