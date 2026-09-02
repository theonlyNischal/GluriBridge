import { RICHNESS_DISPLAY_LABEL } from "../../lib/format";

const RICHNESS_STYLE: Record<string, string> = {
  rich: "bg-forest-100 text-forest-700",
  corroborated: "bg-teal-100 text-teal-700",
  thin: "bg-clay-100 text-clay-700",
};

// Terminology pass (2026-09-02) — "rich"/"thin" now show as plain-language
// labels (RICHNESS_DISPLAY_LABEL); "corroborated" wasn't part of the ask,
// so it keeps its plain capitalized raw form, same as before. The real
// technical richness term is kept as a hover title either way, so a
// reader who already knows "rich"/"thin"/"corroborated" from earlier
// conversations/docs can still confirm it.
export function RichnessBadge({ richness }: { richness: string }) {
  return (
    <span
      title={richness}
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${RICHNESS_STYLE[richness] ?? "bg-stone-200 text-stone-600"}`}
    >
      {RICHNESS_DISPLAY_LABEL[richness] ?? richness}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = { sruk: "SRUK", srn_ppi: "SRN-PPI", verra: "Verra", news: "News", brwa: "BRWA" };

// Terminology pass (2026-09-02) — deliberately kept the acronym as the
// visible badge text here (SRUK/SRN-PPI/Verra/BRWA), NOT the plain-
// language name, unlike every other terminology-pass swap: this is a
// compact 4-6 character inline tag on candidate rows/cards, and "Carbon
// Registry"/"Climate Registry"/"International Registry"/"Customary
// Territory Registry" would roughly triple the badge's width and break
// the compact layout it's used in. The plain name goes in the hover
// title instead — the one deliberate exception to "plain label visible,
// technical term in the tooltip" this round.
const SOURCE_PLAIN_LABEL: Record<string, string> = {
  sruk: "Carbon Registry",
  srn_ppi: "Climate Registry",
  verra: "International Registry",
  brwa: "Customary Territory Registry",
  news: "News Article",
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <span
      title={SOURCE_PLAIN_LABEL[source] ?? undefined}
      className="inline-block whitespace-nowrap rounded border border-stone-300 bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide text-stone-700"
    >
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}
