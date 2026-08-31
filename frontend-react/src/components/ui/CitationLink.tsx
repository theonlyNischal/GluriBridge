import type { Citation } from "../../lib/types";
import { HonestState } from "./HonestState";

/** Real source -> a real link. No document -> the honest-disclosure pattern, never a dead-looking link. */
export function CitationLink({ citation }: { citation: Citation | null }) {
  if (!citation) return null;
  if (citation.url) {
    return (
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        title={citation.source_type}
        className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-medium text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900"
      >
        ↗ source
      </a>
    );
  }
  return <HonestState kind="no_source" compact title={citation.note ?? citation.source_type ?? undefined} />;
}
