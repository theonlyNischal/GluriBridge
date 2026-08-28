import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { CandidateListRow, CandidateStatusValue } from "./types";

/**
 * Fetch-once, shared-across-pages candidate list — mirrors the vanilla-JS
 * app's global RANKED variable. Dashboard, Candidates list, Tracked, and
 * Territory Discovery all read from this ONE fetch rather than each
 * hitting GET /candidates independently. When a candidate's status
 * changes (from the detail page), updateStatus() patches this shared list
 * in place so every other page reflects it immediately, without a
 * refetch — same behavior the old app had for the original contacted flag.
 */
interface CandidatesContextValue {
  candidates: CandidateListRow[] | null;
  error: string | null;
  updateStatus: (id: string, status: CandidateStatusValue, statusChangedAt: string | null) => void;
}

const CandidatesContext = createContext<CandidatesContextValue | null>(null);

export function CandidatesProvider({ children }: { children: ReactNode }) {
  const [candidates, setCandidates] = useState<CandidateListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCandidates()
      .then(setCandidates)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const updateStatus = useCallback((id: string, status: CandidateStatusValue, statusChangedAt: string | null) => {
    setCandidates((prev) => (prev ? prev.map((r) => (r.candidate_id === id ? { ...r, status, status_changed_at: statusChangedAt } : r)) : prev));
  }, []);

  return <CandidatesContext.Provider value={{ candidates, error, updateStatus }}>{children}</CandidatesContext.Provider>;
}

export function useCandidates() {
  const ctx = useContext(CandidatesContext);
  if (!ctx) throw new Error("useCandidates() must be used within a CandidatesProvider");
  return ctx;
}
