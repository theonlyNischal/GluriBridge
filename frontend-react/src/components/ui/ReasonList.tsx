import { CheckCircle2 } from "lucide-react";
import type { Citation, ReasonEntry } from "../../lib/types";
import { EvidenceTag } from "./EvidenceTag";
import { CitationLink } from "./CitationLink";
import { HonestState } from "./HonestState";
import { InfoPopover } from "./InfoPopover";
import { classifyCredibilityReason, classifyNeedReason, POLARITY_STYLE, type ReasonPolarity } from "../../lib/reasonPolarity";

/**
 * Level 2 popover content (2026-08-31) — every real field a Citation can
 * carry, verbatim, never reworded: source_type, retrieved_at, a real
 * clickable source link when one exists, and the fuller "why" note. This
 * is the SAME data CitationLink already rendered inline (just spread
 * across an "↗ source" link or a compact HonestState chip) — moved into
 * one consistent popover, not shortened or rewritten. No "Evidence tier"
 * row is fabricated here: Citation has no tier/confidence field of its
 * own (that's a contact-resolution concept, not a citation one) — never
 * inventing a field that isn't real data.
 */
function CitationDetail({ citation }: { citation: Citation }) {
  if (!citation.source_type && !citation.retrieved_at && !citation.url && !citation.note) return null;
  return (
    <div className="space-y-2">
      {citation.source_type && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Source</div>
          <div className="text-stone-700">{citation.source_type}</div>
        </div>
      )}
      {citation.retrieved_at && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Retrieved</div>
          <div className="font-mono text-[11px] text-stone-700">{citation.retrieved_at}</div>
        </div>
      )}
      {citation.url && (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900"
        >
          ↗ View source
        </a>
      )}
      {citation.note && (
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">Why</div>
          <p className="text-stone-700">{citation.note}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Every reason list in the app (need reasons, why_gluri, credibility
 * component reasons, DPP validation proxy) renders through this one
 * component.
 *
 * credibility_components reasons never carry an evidence_level field from
 * the API — they're registry-confirmed facts (registry presence, a
 * document on file, a coordinate on file), not adjudicated need-signal
 * claims, so the backend never bothered tagging them. A missing tag is
 * treated as FACT here, explicitly, not left blank: in a UI whose whole
 * premise is "every claim is labeled," an untagged claim reads as an
 * omission, not as "obviously factual" — worse than a wrong tag, per this
 * session's earlier decision that credibility reasons should be treated
 * as implicitly factual. This default belongs here, at render time, not
 * in the API types — the backend still legitimately omits the field.
 *
 * `kind` picks the real-polarity classifier (see lib/reasonPolarity.ts) —
 * additive color-coding on top of the fact/hypothesis tag, never a
 * replacement for it. "neutral" (the default) applies no polarity color
 * at all, for contexts where positive/gap framing doesn't genuinely apply
 * (e.g. the DPP validation proxy, which is explicitly unscored hypothesis
 * evidence, not a scored finding either way).
 *
 * `citationDisplay` (2026-08-31, progressive disclosure) — "inline"
 * (default, unchanged) keeps CitationLink's original always-visible
 * treatment, used by the Dossier tab's Why Gluri / DPP validation proxy
 * panels (Level 3, the full evidence trail — deliberately left alone).
 * "popover" is opt-in, used only by the Need/Credibility score panels:
 * the fact/hypothesis tag and the claim text stay exactly as visible as
 * ever (Level 1, never touched) — only the citation's supporting detail
 * moves behind an "ⓘ" (Level 2), verbatim, via CitationDetail above.
 */
export function ReasonList({
  reasons,
  emptyText,
  kind = "neutral",
  citationDisplay = "inline",
}: {
  reasons: ReasonEntry[];
  emptyText?: string;
  kind?: "need" | "credibility" | "neutral";
  citationDisplay?: "inline" | "popover";
}) {
  if (!reasons.length) {
    return emptyText ? <HonestState kind="no_data" label={emptyText} compact /> : null;
  }
  return (
    <ul className="space-y-2">
      {reasons.map((r, i) => {
        const polarity: ReasonPolarity = kind === "need" ? classifyNeedReason() : kind === "credibility" ? classifyCredibilityReason(r.text) : "neutral";
        const style = POLARITY_STYLE[polarity];
        return (
          <li key={i} className={`flex items-start justify-between gap-3 rounded-r py-1.5 pl-2.5 pr-2 text-[13px] leading-relaxed ${style.border} ${style.bg}`}>
            <span className="flex items-start gap-2">
              <EvidenceTag level={r.evidence_level ?? "fact"} />
              {polarity === "positive" && <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-compliance-green" />}
              <span className={style.text ?? "text-stone-700"}>{r.text}</span>
            </span>
            {citationDisplay === "popover" ? (
              r.citation && (
                <InfoPopover>
                  <CitationDetail citation={r.citation} />
                </InfoPopover>
              )
            ) : (
              <CitationLink citation={r.citation} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
