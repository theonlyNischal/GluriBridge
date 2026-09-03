import { useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Lock, Radio, Loader2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Panel } from "../components/ui/Panel";
import type { RefreshLogEntry, RefreshStatus, SourceProgress, StatsResponse, SyncSource } from "../lib/types";

// Mirrors orchestrate.py's CADENCE_DAYS exactly (2026-09-03) — a
// documented, intentional mirror for display purposes only (same
// established pattern as e.g. StatusBadge.tsx's STATUS_DOT_COLOR
// mirroring STATUS_LABEL), never the source of truth: the real due/not-
// due decision is always made backend-side in orchestrate.is_due() at
// refresh time, this only drives what badge to show while looking at a
// stats snapshot.
const CADENCE_DAYS: Record<SyncSource, number | null> = {
  sruk: 1,
  srn_ppi: 30,
  verra: 1,
  brwa: null,
};

const SOURCE_LABEL: Record<SyncSource, string> = {
  sruk: "SRUK",
  srn_ppi: "SRN-PPI",
  verra: "Verra",
  brwa: "BRWA",
};

const SOURCES: SyncSource[] = ["sruk", "srn_ppi", "verra", "brwa"];

const PHASE_LABEL: Record<string, string> = {
  starting: "Starting…",
  pipeline: "Normalizing, scoring, and (if requested) searching live news…",
  loading: "Loading results into the database…",
};

const LIVE_SOURCE_STYLE: Record<SourceProgress, string> = {
  pending: "bg-stone-100 text-stone-400",
  running: "bg-compliance-amberBg text-compliance-amber",
  done: "bg-forest-100 text-forest-800",
  skipped: "bg-stone-100 text-stone-500",
  failed: "bg-compliance-redBg text-compliance-red",
};

const LIVE_SOURCE_TEXT: Record<SourceProgress, string> = {
  pending: "Waiting…",
  running: "Scraping now…",
  done: "Done",
  skipped: "Not due",
  failed: "Failed",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtAge(days: number | null): string {
  if (days == null) return "unknown age";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function sourceStatus(source: SyncSource, ageDays: number | null): { label: string; className: string } {
  const cadence = CADENCE_DAYS[source];
  if (ageDays == null) return { label: "Never fetched", className: "bg-stone-200 text-stone-600" };
  if (cadence == null) return { label: "Manual only", className: "bg-stone-100 text-stone-500" };
  if (ageDays >= cadence) return { label: "Due for refresh", className: "bg-compliance-amberBg text-compliance-amber" };
  return { label: "Up to date", className: "bg-forest-100 text-forest-800" };
}

const REFRESH_STATUS_STYLE: Record<RefreshLogEntry["status"], string> = {
  ok: "bg-forest-100 text-forest-800",
  frozen: "bg-stone-200 text-stone-600",
  error: "bg-compliance-redBg text-compliance-red",
};

const POLL_MS = 1500;

/**
 * Registry Sync page (2026-09-03) — real per-source freshness (from the
 * exact same orchestrate.check_all_freshness() the backend's own
 * cadence logic uses), a real refresh action wired to POST /refresh,
 * real LIVE per-source progress (GET /refresh-status, polled while a
 * refresh is running — added 2026-09-03 after watching a real refresh
 * sit on one opaque "Refreshing…" spinner for several minutes with zero
 * visibility into which source it was actually on), and a real
 * append-only activity log (GET /refresh-log). No simulated "demo
 * mode" — see the conversation this was scoped from: a fabricated
 * progress bar that reports success regardless of what actually
 * happened is a real dishonesty risk for an app whose entire pitch is
 * "every number traces back to a real, checkable source," not a demo-
 * safety feature. The actual demo-safety property here is structural,
 * not simulated: a failed or frozen refresh never overwrites the live
 * DB (scheduler.run_refresh_cycle() only loads a result into SQLite
 * after the pipeline succeeds), so the page always keeps showing the
 * last real successful state.
 */
export function SyncPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [log, setLog] = useState<RefreshLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"registry" | "news" | null>(null);
  const [progress, setProgress] = useState<RefreshStatus | null>(null);
  const [result, setResult] = useState<{ kind: "ok" | "error" | "frozen"; message: string } | null>(null);
  // Guards against setting state after unmount — a poll loop is a real
  // async chain that can outlive the component (e.g. the user navigates
  // away mid-refresh). Reset to false at the TOP of the mount effect
  // below, not just at useRef's initial value — React 18 StrictMode
  // double-invokes effects in dev (mount -> cleanup -> mount again), so
  // a cleanup-only effect here would set this true during that synthetic
  // first cleanup and never flip it back before the real mount's async
  // work resolves, permanently stuck showing "Loading…" forever (a real
  // bug caught here, not hypothetical — this exact page hung on it).
  const cancelledRef = useRef(false);

  function load() {
    Promise.all([api.getStats(), api.getRefreshLog()])
      .then(([s, l]) => {
        if (cancelledRef.current) return;
        setStats(s);
        setLog(l);
      })
      .catch((e) => !cancelledRef.current && setError(String(e.message ?? e)));
  }

  // On mount, ALSO check whether a refresh is already running — e.g. a
  // page load/reload while one triggered elsewhere (another tab, the
  // scheduler) is still in flight — and start polling it immediately
  // rather than only ever reacting to this page's own button click.
  useEffect(() => {
    cancelledRef.current = false;
    load();
    api
      .getRefreshStatus()
      .then((s) => {
        if (cancelledRef.current || !s?.in_progress) return;
        setBusy(s.with_news ? "news" : "registry");
        pollUntilDone();
      })
      .catch(() => {
        /* advisory only, same as StalenessBanner's own pattern — never block the page on this */
      });
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollUntilDone() {
    while (!cancelledRef.current) {
      let status: RefreshStatus | null;
      try {
        status = await api.getRefreshStatus();
      } catch {
        break; // a transient network hiccup while polling — stop rather than loop forever on errors
      }
      if (cancelledRef.current) return;
      setProgress(status);
      if (!status || !status.in_progress) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (cancelledRef.current) return;

    // The real outcome (ok/error/frozen) lives in the activity log now,
    // not in the POST /refresh response (which only ever said
    // "started") — the newest entry is this run's, since nothing else
    // can log while one refresh is in progress (scheduler.
    // run_refresh_cycle()'s own in-progress guard).
    try {
      const [freshLog, freshStats] = await Promise.all([api.getRefreshLog(1), api.getStats()]);
      if (cancelledRef.current) return;
      const entry = freshLog[0];
      if (entry?.status === "ok") {
        setResult({ kind: "ok", message: entry.used_news ? "Refreshed successfully, with live news enrichment." : "Refreshed successfully (registry-only)." });
      } else if (entry?.status === "error") {
        setResult({
          kind: "error",
          message: `Couldn't complete the refresh: ${entry.detail}. Showing the last successful data from ${fmtDateTime(freshStats.last_registry_refresh)}.`,
        });
      }
    } catch {
      /* the final load() below still runs regardless and will show whatever's real */
    }
    setBusy(null);
    setProgress(null);
    load();
  }

  async function runRefresh(withNews: boolean) {
    setBusy(withNews ? "news" : "registry");
    setResult(null);
    setProgress(null);
    try {
      await api.refresh(withNews); // returns {status:"started"} — the real outcome comes later, via polling
    } catch (e) {
      if (e instanceof ApiError && e.status === 423) {
        const detail = e.body as { reason?: string } | null;
        setResult({ kind: "frozen", message: detail?.reason ?? "Data is frozen — refresh blocked." });
      } else if (e instanceof ApiError && e.status === 409) {
        setResult({ kind: "error", message: "A refresh is already in progress — showing its live status now." });
        pollUntilDone();
        return;
      } else if (e instanceof ApiError && e.status === 400) {
        const detail = e.body as { detail?: string } | null;
        setResult({ kind: "error", message: detail?.detail ?? "Refresh request rejected." });
      } else {
        setResult({
          kind: "error",
          message: `Couldn't reach the backend to refresh. Showing the last successful data from ${fmtDateTime(stats?.last_registry_refresh ?? null)}.`,
        });
      }
      setBusy(null);
      return;
    }
    pollUntilDone();
  }

  if (error) return <div className="px-6 py-6 text-clay-700">Failed to load sync status: {error}</div>;
  if (!stats || !log) return <div className="px-6 py-6 text-stone-400">Loading…</div>;

  const frozen = stats.freeze;
  const newsDisabledReason = !stats.tavily_configured ? "Requires TAVILY_API_KEY configured on the backend (see the repo root's .env.example)." : frozen ? "Data is frozen." : null;
  const inProgress = busy !== null;

  return (
    <div className="px-6 py-6">
      <div className="mb-6 max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-stone-900">Registry Sync</h1>
        <p className="mt-1 text-[13.5px] text-stone-500">
          Real per-source freshness, a real refresh action, and a real activity log — {stats.candidate_count_in_db} candidates currently
          live in the database.
        </p>
      </div>

      {frozen && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-compliance-amber/30 bg-compliance-amberBg px-4 py-3 text-[13px] text-compliance-amber">
          <Lock size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Data frozen since {fmtDateTime(frozen.frozen_at)}</div>
            <div className="mt-0.5 text-compliance-amber/90">{frozen.reason}</div>
          </div>
        </div>
      )}

      <Panel title="Sources" className="mb-5" variant="instrument">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-stone-200 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2 pr-4">Last fetched</th>
                <th className="pb-2 pr-4">Age</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {SOURCES.map((source) => {
                const f = stats.freshness[source];
                // Live progress (2026-09-03) takes over this row's badge
                // while a refresh is actually running — the real,
                // moment-to-moment state, not the pre-refresh snapshot
                // stats was loaded with.
                const live = progress?.in_progress ? progress.source_status[source] : null;
                const status = live ? { label: LIVE_SOURCE_TEXT[live], className: LIVE_SOURCE_STYLE[live] } : sourceStatus(source, f.age_days);
                return (
                  <tr key={source}>
                    <td className="py-2.5 pr-4 font-semibold text-stone-800">{SOURCE_LABEL[source]}</td>
                    <td className="py-2.5 pr-4 font-mono text-stone-600" title={f.timestamp_source ?? undefined}>
                      {fmtDateTime(f.fetched_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-stone-500">{fmtAge(f.age_days)}</td>
                    <td className="py-2.5">
                      <span title={f.note ?? undefined} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}>
                        {live === "running" && <Loader2 size={11} className="animate-spin" />}
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Segmented per-source progress bar — real state only, one
              segment per source in scrape order, colored by
              LIVE_SOURCE_STYLE; the trailing 5th segment covers the
              pipeline/loading phase (no finer-grained progress is
              available there — see PHASE_LABEL below for what's
              actually happening in that stretch instead). */}
          {progress?.in_progress && (
            <div className="mt-4">
              <div className="flex gap-1">
                {SOURCES.map((source) => (
                  <div
                    key={source}
                    className={`h-1.5 flex-1 rounded-full ${
                      progress.source_status[source] === "done"
                        ? "bg-forest-500"
                        : progress.source_status[source] === "failed"
                          ? "bg-compliance-red"
                          : progress.source_status[source] === "running"
                            ? "animate-pulse bg-compliance-amber"
                            : progress.source_status[source] === "skipped"
                              ? "bg-stone-300"
                              : "bg-stone-200"
                    }`}
                  />
                ))}
                <div className={`h-1.5 flex-1 rounded-full ${progress.phase === "pipeline" || progress.phase === "loading" ? "animate-pulse bg-compliance-amber" : "bg-stone-200"}`} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-stone-500">
                <Loader2 size={12} className="animate-spin" />
                {PHASE_LABEL[progress.phase] ?? `Working on ${SOURCE_LABEL[progress.phase as SyncSource] ?? progress.phase}…`}
              </p>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Refresh" className="mb-5" variant="instrument">
        <p className="text-[12.5px] text-stone-500">
          Last registry-only refresh: <span className="font-mono text-stone-700">{fmtDateTime(stats.last_registry_refresh)}</span>
          <br />
          Last refresh with live news enrichment: <span className="font-mono text-stone-700">{fmtDateTime(stats.last_full_refresh_with_news)}</span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => runRefresh(false)}
            disabled={inProgress || !!frozen}
            className="inline-flex items-center gap-2 rounded-lg bg-forest-600 px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw size={14} className={busy === "registry" ? "animate-spin" : ""} />
            {busy === "registry" ? "Refreshing…" : "Refresh registries"}
          </button>
          <button
            onClick={() => runRefresh(true)}
            disabled={inProgress || !!frozen || !stats.tavily_configured}
            title={newsDisabledReason ?? undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-[13.5px] font-semibold text-stone-700 transition hover:border-forest-400 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Radio size={14} className={busy === "news" ? "animate-pulse" : ""} />
            {busy === "news" ? "Refreshing…" : "Full refresh (with news)"}
          </button>
          {newsDisabledReason && !frozen && <span className="text-[12px] text-stone-400">{newsDisabledReason}</span>}
        </div>

        {result && (
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] ${
              result.kind === "ok"
                ? "bg-forest-50 text-forest-800"
                : result.kind === "frozen"
                  ? "bg-stone-100 text-stone-600"
                  : "bg-compliance-redBg text-compliance-red"
            }`}
          >
            {result.kind === "ok" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
            <span>{result.message}</span>
          </div>
        )}
      </Panel>

      <Panel title="Activity log" variant="instrument">
        {log.length === 0 ? (
          <p className="text-[13px] text-stone-400">No refresh attempts recorded yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {log.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${REFRESH_STATUS_STYLE[entry.status]}`}>{entry.status}</span>
                  <span className="text-[11.5px] text-stone-400">{fmtDateTime(entry.started_at)}</span>
                  <span className="text-[11px] text-stone-400">·</span>
                  <span className="text-[11px] uppercase tracking-wide text-stone-400">{entry.triggered_by}</span>
                  {entry.with_news && (
                    <span className="text-[11px] text-stone-400">· {entry.used_news ? "news enrichment used" : "news enrichment requested, not used"}</span>
                  )}
                </div>
                {entry.detail && <p className="mt-1.5 text-[12.5px] leading-relaxed text-stone-600">{entry.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
