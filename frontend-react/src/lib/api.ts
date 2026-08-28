import type { CandidateDetail, CandidateListRow, CandidateStatusValue, StatusUpdateResult, StatsResponse, TerritoryListEntry } from "./types";

export const API_BASE = "http://localhost:8000";

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
};
