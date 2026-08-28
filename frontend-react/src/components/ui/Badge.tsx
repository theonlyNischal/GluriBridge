const RICHNESS_STYLE: Record<string, string> = {
  rich: "bg-forest-100 text-forest-700",
  corroborated: "bg-teal-100 text-teal-700",
  thin: "bg-clay-100 text-clay-700",
};

export function RichnessBadge({ richness }: { richness: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${RICHNESS_STYLE[richness] ?? "bg-stone-200 text-stone-600"}`}>
      {richness}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = { sruk: "SRUK", srn_ppi: "SRN-PPI", verra: "Verra", news: "News", brwa: "BRWA" };

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-block whitespace-nowrap rounded border border-stone-300 bg-white px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide text-stone-700">
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

