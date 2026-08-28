import type { ComplianceBadgeValue } from "../../lib/types";

const STYLES: Record<ComplianceBadgeValue, string> = {
  green: "text-compliance-green bg-compliance-greenBg",
  amber: "text-compliance-amber bg-compliance-amberBg",
  red: "text-compliance-red bg-compliance-redBg",
  not_applicable: "text-compliance-na bg-compliance-naBg",
};

const LABEL: Record<ComplianceBadgeValue, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
  not_applicable: "N/A",
};

export function ComplianceBadge({ badge, label }: { badge: ComplianceBadgeValue; label?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${STYLES[badge]}`}>
      {label ?? LABEL[badge]}
    </span>
  );
}
