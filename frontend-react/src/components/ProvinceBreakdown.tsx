import { groupByProvince, PROVINCE_NOT_AVAILABLE } from "../lib/provinceNormalize";
import { t } from "../lib/i18n";
import type { Lang } from "../lib/LanguageContext";
import type { CandidateListRow } from "../lib/types";

// Named provinces beyond this rank collapse into one real "Other
// provinces" row so the panel stays a simple, scannable list rather than
// ~20 rows long — the real long-tail breakdown is still there, just one
// hover away via the title tooltip, never dropped.
const MAX_NAMED_ROWS = 8;

// Opt-in lang (2026-09-03, EN/KO toggle, Dashboard-only component) —
// real province names (Jawa Barat, Kalimantan Tengah, ...) are proper
// nouns and NEVER translated regardless of lang; only the two UI-chrome
// labels below ("Not available" / "Other") ever change.
export function ProvinceBreakdown({ candidates, lang = "en" }: { candidates: CandidateListRow[]; lang?: Lang }) {
  const grouped = groupByProvince(candidates);
  const counts = new Map<string, number>();
  grouped.forEach((rows, province) => counts.set(province, rows.length));

  const notAvailable = counts.get(PROVINCE_NOT_AVAILABLE) ?? 0;
  counts.delete(PROVINCE_NOT_AVAILABLE);

  const named = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = named.slice(0, MAX_NAMED_ROWS);
  const rest = named.slice(MAX_NAMED_ROWS);
  const restTotal = rest.reduce((sum, [, n]) => sum + n, 0);

  const total = candidates.length;
  const rows: { label: string; count: number; muted?: boolean; title?: string }[] = shown.map(([label, count]) => ({ label, count }));
  if (restTotal > 0) {
    // Kept short ("Other (N)") rather than "Other provinces (N more)" —
    // the panel's label column is narrow at this width, and the real
    // per-province tail breakdown is still one hover away via the tooltip,
    // not lost.
    rows.push({
      label: `${t("province.other", lang)} (${rest.length})`,
      count: restTotal,
      title: rest.map(([p, n]) => `${p}: ${n}`).join(", "),
    });
  }
  if (notAvailable > 0) {
    rows.push({
      label: lang === "ko" ? t("province.notAvailable", "ko") : PROVINCE_NOT_AVAILABLE,
      count: notAvailable,
      muted: true,
      title: "Real candidates with no province recorded in any source — a genuine data gap, shown rather than hidden.",
    });
  }
  rows.sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[12.5px]" title={r.title}>
          <span className={`w-[126px] shrink-0 truncate ${r.muted ? "italic text-stone-400" : "text-stone-600"}`}>{r.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
            {/* Muted stone, not teal (2026-08-31, Dashboard visual-direction
                test) — accent color reserved for only the one most
                important element per screen; this bar chart doesn't need
                its own separate hue to be readable. */}
            <div className={`h-full rounded-full ${r.muted ? "bg-stone-300" : "bg-stone-500"}`} style={{ width: `${(r.count / maxCount) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-mono text-stone-500">
            {r.count} ({total ? Math.round((r.count / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}
