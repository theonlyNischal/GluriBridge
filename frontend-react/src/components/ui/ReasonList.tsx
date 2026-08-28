import { CheckCircle2 } from "lucide-react";
import type { ReasonEntry } from "../../lib/types";
import { EvidenceTag } from "./EvidenceTag";
import { CitationLink } from "./CitationLink";
import { HonestState } from "./HonestState";
import { classifyCredibilityReason, classifyNeedReason, POLARITY_STYLE, type ReasonPolarity } from "../../lib/reasonPolarity";

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
 */
export function ReasonList({
  reasons,
  emptyText,
  kind = "neutral",
}: {
  reasons: ReasonEntry[];
  emptyText?: string;
  kind?: "need" | "credibility" | "neutral";
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
            <CitationLink citation={r.citation} />
          </li>
        );
      })}
    </ul>
  );
}
