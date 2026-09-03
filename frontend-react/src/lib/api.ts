import type {
  CandidateDetail,
  CandidateListRow,
  CandidateStatusValue,
  StatusUpdateResult,
  StatsResponse,
  TerritoryListEntry,
  RefreshLogEntry,
  RefreshResult,
  RefreshStatus,
  SyncSource,
} from "./types";

// Build-time override for deployment (e.g. Render's Static Site build env
// vars) — Vite only exposes client-bundle env vars prefixed VITE_. Falls
// back to localhost:8000 for local dev, unchanged from before.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

// Carries the real parsed response body on a non-2xx (2026-09-03,
// Sync page) — the plain post() helper above discards it, but the Sync
// page needs the REAL reason (423's frozen-at/reason, 400's "no Tavily
// key configured" detail) to show the user, not a generic "HTTP 423".
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function postWithErrorBody<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* a non-JSON error body (rare — a proxy/network-level failure, not
       a real API response) — parsed stays null, ApiError still carries
       the real status. */
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

export const api = {
  listCandidates: () => get<CandidateListRow[]>("/candidates"),
  getCandidate: (id: string) => get<CandidateDetail>(`/candidates/${encodeURIComponent(id)}`),
  territoryGeometry: (idx: string) => get<GeoJSON.GeoJSON>(`/territories/${encodeURIComponent(idx)}/geometry`),
  listTerritories: (search: string, limit = 30) =>
    get<TerritoryListEntry[]>(`/territories?search=${encodeURIComponent(search)}&limit=${limit}`),
  // Real per-territory metadata (name/province/policy_tier/etc, no
  // geometry) for one already-known idx — used to label a small, bounded
  // set of confirmed BRWA overlaps by name, not a bulk fetch.
  getTerritory: (idx: string) => get<TerritoryListEntry>(`/territories/${encodeURIComponent(idx)}`),
  getStats: () => get<StatsResponse>("/stats"),
  setStatus: (id: string, status: CandidateStatusValue, note?: string) =>
    post<StatusUpdateResult>(`/candidates/${encodeURIComponent(id)}/status`, { status, note }),
  // Sync page (2026-09-03). refresh() returns {status:"started"}
  // immediately (202) and throws ApiError on a non-2xx — 423 (frozen),
  // 409 (already in progress), or 400 (with_news requested but no
  // Tavily key configured), each carrying the real detail body, not
  // just a status code. Actual progress: poll getRefreshStatus() while
  // it's in flight; the real outcome lands in getRefreshLog() once
  // getRefreshStatus() reports null/not-in-progress again.
  getRefreshLog: (limit = 20) => get<RefreshLogEntry[]>(`/refresh-log?limit=${limit}`),
  getRefreshStatus: () => get<RefreshStatus | null>("/refresh-status"),
  // only (2026-09-03, per-source buttons): restricts to exactly one
  // source, always runs regardless of cadence. withNews is meaningless
  // combined with only (the backend ignores it in that case — news
  // isn't scoped to one registry source) so callers never pass both.
  refresh: (withNews = false, only?: SyncSource) => postWithErrorBody<RefreshResult>(`/refresh?with_news=${withNews}${only ? `&only=${only}` : ""}`),
};
