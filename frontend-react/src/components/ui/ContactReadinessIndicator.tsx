import { Mail, AlertTriangle } from "lucide-react";
import type { CandidateListRow } from "../../lib/types";

/**
 * Three real, distinct contact-readiness states — not a binary has/
 * doesn't-have dot. Mirrors the exact iconography/colors the Outreach
 * tab (CandidateDetailPage) already uses for the same three real
 * conditions, rather than inventing a new visual language:
 *   - Mail icon, forest — a real email is on file (either confidence;
 *     see has_email vs has_low_confidence_email for the finer real
 *     distinction, surfaced in this icon's hover title).
 *   - AlertTriangle, amber — the Outreach tab's own warning color/tone
 *     for a resolved contact with a name but no email (Tier A,
 *     "needs manual lookup").
 *   - A muted stone dash — the same absence-state visual language
 *     HonestState uses everywhere else in this app — for no contact
 *     resolved at all.
 */
export function ContactReadinessIndicator({ row }: { row: CandidateListRow }) {
  if (row.has_email || row.has_low_confidence_email) {
    const confidence = row.has_email ? "high confidence" : "lower confidence — worth a manual check";
    return (
      <span title={`Real email on file (${confidence})`} className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-50 text-forest-600">
        <Mail size={13} strokeWidth={2.25} />
      </span>
    );
  }
  if (row.has_resolved_contact) {
    // Distinguishes "never searched for an email" from "searched and found
    // nothing" (2026-08-31) — same wording pattern as the Key Gaps sidebar
    // and the Outreach warning; reuses this exact indicator's existing
    // treatment, no new visual element.
    const title = row.contact_tier_b_attempted
      ? "A name is on file, but no email — a web search did not find a public email; manual lookup would need a different channel (e.g. contacting the org directly)"
      : "A name is on file, but no email — needs manual lookup before outreach";
    return (
      <span title={title} className="flex h-6 w-6 items-center justify-center rounded-full bg-compliance-amberBg text-compliance-amber">
        <AlertTriangle size={13} strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span title="No contact resolved for this candidate yet" className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-400">
      —
    </span>
  );
}
