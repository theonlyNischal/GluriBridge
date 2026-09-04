import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { HonestState } from "./ui/HonestState";
import { StatusBadge, STATUS_OPTIONS } from "./ui/StatusBadge";
import { useT, type StringKey } from "../lib/i18n";
import type { CandidateStatusValue, StatusHistoryEntry, StatusUpdateResult } from "../lib/types";

// Same local KO mirror of STATUS_OPTIONS' labels as TrackedPage.tsx (the
// only page that renders this component — see the file comment below) —
// reuses the generic status.* keys from i18n.ts rather than editing
// StatusBadge.tsx, which the Candidates list/detail pages also depend on
// for their own, still-English rendering.
const STATUS_KEY: Record<CandidateStatusValue, StringKey> = {
  not_contacted: "status.notContacted",
  contacted: "status.contacted",
  follow_up_needed: "status.followUpNeeded",
  done: "status.done",
  rejected: "status.rejected",
};

/**
 * THE full status selector + note field + history list — lives ONLY on
 * the Tracked page now (2026-08-28 restructure). Previously embedded in
 * the candidate detail page; moved out wholesale, not duplicated, per the
 * real division of responsibility: "what are we doing with this candidate
 * right now" is Tracked's job, not the detail page's.
 */
export function StatusEditor({
  candidateId,
  status,
  note,
  history,
  onSaved,
}: {
  candidateId: string;
  status: CandidateStatusValue;
  note: string | null;
  history: StatusHistoryEntry[];
  onSaved: (updated: StatusUpdateResult) => void;
}) {
  const { t } = useT();
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [busy, setBusy] = useState(false);

  // Re-sync the draft whenever a DIFFERENT candidate's real saved state
  // arrives (selecting another row) — never wipe an in-progress edit for
  // the same candidate out from under the user.
  useEffect(() => {
    setDraftStatus(status);
    setDraftNote(note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const dirty = draftStatus !== status || draftNote !== (note ?? "");

  async function save() {
    setBusy(true);
    try {
      const updated = await api.setStatus(candidateId, draftStatus, draftNote.trim() || undefined);
      onSaved(updated);
    } catch (err) {
      alert(t("tracked.editor.failedToUpdate") + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    // Two real, clearly-separated sections — "update status" (the active
    // control surface) and "status history" (the read-only real record) —
    // side by side rather than stacked, each in its own card with its own
    // labeled header, so the two concerns read as distinct at a glance
    // instead of blurring into one dense block. Layout richness only, no
    // new fields.
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div>
        <h4 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">{t("tracked.editor.updateStatus")}</h4>
        <div className="instrument-panel space-y-4 border border-stone-300 bg-stone-50 p-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t("tracked.editor.statusLabel")}</label>
            <select
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value as CandidateStatusValue)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[13.5px] focus:border-forest-500 focus:outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(STATUS_KEY[o.value])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{t("tracked.editor.noteLabel")}</label>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder={t("tracked.editor.notePlaceholder")}
              rows={3}
              className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-[13.5px] focus:border-forest-500 focus:outline-none"
            />
          </div>
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="w-full rounded-lg bg-forest-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("tracked.editor.saving") : t("tracked.editor.save")}
          </button>
        </div>
      </div>

      {/* Real status history — a timestamp per REAL status change
          (db.candidate_status_history), not just one overwritten
          status_changed_at. Empty state uses the same HonestState pattern
          as everywhere else in this app. */}
      <div>
        <h4 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-stone-500">{t("tracked.editor.statusHistory")}</h4>
        <div className="instrument-panel border border-stone-300 bg-stone-50 p-5">
          {history.length === 0 ? (
            <HonestState kind="not_checked" label={t("tracked.editor.noHistory")} compact />
          ) : (
            <ol className="space-y-3">
              {[...history].reverse().map((h, i) => (
                <li key={i} className="rounded-md border border-stone-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={h.status} />
                    <span className="text-[11.5px] text-stone-400">{h.changed_at}</span>
                  </div>
                  {h.note && <p className="mt-1.5 text-[12.5px] leading-relaxed text-stone-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
