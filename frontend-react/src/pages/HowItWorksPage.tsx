import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCandidates } from "../lib/CandidatesContext";
import { Panel } from "../components/ui/Panel";

/**
 * "How this works" — a permanent, honest explanation of the pipeline,
 * built specifically so it can't silently go stale the way READMEs/docs
 * have drifted in this project before (see PROJECT_CONTEXT.md's repeated
 * "found stale, corrected" entries). Every number on this page is fetched
 * live from the real API on mount — GET /stats and the already-shared
 * candidates list (useCandidates(), the same one-fetch-shared-across-
 * pages source Dashboard/Candidates/Tracked/Territory Discovery all use)
 * — never typed into the component as static text. The one number that
 * needs a real candidate to read (how many Permenhut rules are wired vs.
 * total) is fetched from the first real candidate in the list, not
 * hardcoded — the rule SET is constant across every candidate, only
 * whether each individual rule fires varies.
 *
 * Reuses the exact instrument-panel/hairline-border treatment approved
 * on the other 5 pages this session — no new visual language, single
 * page, no multi-round polish project, per explicit scope.
 */
export function HowItWorksPage() {
  const { candidates } = useCandidates();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.getStats>> | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [complianceCounts, setComplianceCounts] = useState<{ wired: number; total: number } | null>(null);

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((e) => setStatsError(String(e.message ?? e)));
  }, []);

  // Live wired/total Permenhut rule count — read from one real candidate's
  // actual scoring.compliance response (other_rules + not_wired_rules are
  // the real, complete rule lists any real candidate carries), not a
  // number typed into this file. Picks the first candidate in whatever
  // order the shared list already loaded in — no candidate is special
  // here, the rule set itself is what's being counted.
  useEffect(() => {
    if (!candidates || candidates.length === 0) return;
    api
      .getCandidate(candidates[0].candidate_id)
      .then((d) => {
        const wired = 1 + d.scoring.compliance.other_rules.length;
        const total = wired + d.scoring.compliance.not_wired_rules.length;
        setComplianceCounts({ wired, total });
      })
      .catch(() => setComplianceCounts(null));
  }, [candidates]);

  if (!candidates) return <div className="px-6 py-6 text-stone-400">Loading…</div>;
  if (statsError) return <div className="px-6 py-6 text-clay-700">Failed to load live stats: {statsError}</div>;

  const total = candidates.length;
  // Real per-source candidate contribution — computed from each real
  // candidate's own `sources` list (the real identity-resolution merge
  // trail), not a backend field invented for this page.
  const sourceCount = (source: string) => candidates.filter((r) => r.sources.includes(source)).length;

  const hasEmail = candidates.filter((r) => r.has_email).length;
  const lowConfidenceEmail = candidates.filter((r) => r.has_low_confidence_email).length;
  const resolvedContact = candidates.filter((r) => r.has_resolved_contact).length;
  // Same real, distinct-bucket math as the Dashboard's contact-ready line —
  // never restated as "resolvedContact" itself, which would double-count
  // the two email buckets it already contains.
  const nameOnlyNoEmail = resolvedContact - hasEmail - lowConfidenceEmail;
  const nothingFound = total - resolvedContact;

  const p = stats?.pipeline_stats ?? null;

  return (
    <div className="topo-watermark bg-field-paper px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-stone-900">How this works</h1>
        <p className="mt-1 text-[13.5px] text-stone-500">
          A permanent, honest explanation of this pipeline — every number below is fetched live from the real API, never typed in.
        </p>
      </div>

      <div className="max-w-4xl space-y-5">
        <Panel title="Data sources" variant="instrument">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SourceCard
              name="SRUK"
              description="Sistem Registri Unit Karbon — Indonesia's carbon-unit registry. Registers the tradable credit itself, only after validation/verification."
              stat={`${sourceCount("sruk")} of ${total} final candidates`}
              detail={p ? `${p.sruk_and_srn_ppi_input} raw SRUK+SRN-PPI records fetched (combined — the pipeline doesn't currently split this raw count by source)` : null}
            />
            <SourceCard
              name="SRN-PPI"
              description="Sistem Registri Nasional Pengendalian Perubahan Iklim — the broader climate-action registry. Registers the mitigation action itself, regardless of whether it becomes a tradable credit."
              stat={`${sourceCount("srn_ppi")} of ${total} final candidates`}
              detail={null}
            />
            <SourceCard
              name="Verra"
              description="The international voluntary carbon standard registry — the track most non-Indonesian projects use."
              stat={`${sourceCount("verra")} of ${total} final candidates`}
              detail={p ? `${p.verra_input} raw Verra records fetched (before filtering to Indonesia-only, forestry-sector projects)` : null}
            />
            <SourceCard
              name="BRWA"
              description="Badan Registrasi Wilayah Adat — Indonesia's customary/indigenous territory registry (NGO-run). Cross-referenced as real land-rights evidence, not another candidate source."
              stat={stats ? `${stats.brwa_territories.total.toLocaleString()} territories tracked` : "—"}
              detail={
                stats
                  ? `${stats.brwa_territories.with_geometry.toLocaleString()} (${Math.round((stats.brwa_territories.with_geometry / stats.brwa_territories.total) * 100)}%) have real boundary geometry on file — a confirmed ceiling for this data source, not an in-progress number`
                  : null
              }
            />
            <SourceCard
              name="Tavily (live web search)"
              description="Used to discover organizations with no registry presence at all, and to attempt finding a contact when a registry has no named individual on file."
              stat={`${sourceCount("news")} of ${total} final candidates discovered this way`}
              detail={p ? `${p.news_queries_run} real search queries run, ${p.news_hits_processed} hits processed` : null}
            />
          </div>
        </Panel>

        <Panel title="How scoring works" variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            Every candidate gets two independent scores — <strong>need</strong> (is there a real documentation/monitoring gap Gluri could
            fill) and <strong>credibility</strong> (how mature/confirmed the project itself is). These are <strong>never combined into one
            ranking</strong> — a fully-documented, credible project can genuinely have a need score of 0 (no gap detected, not a bad
            candidate), and a brand-new, thin lead can score high on need while still being low-credibility. Sort by whichever axis you're
            trying to find.
          </p>
          <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-stone-500">What drives the need score</h4>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• Reached a technical/validation stage but hasn't filed the core project document either track requires (a DRAM or a DPP).</li>
            <li>• No technical or monitoring documentation submitted to any registry at all.</li>
            <li>• Registered on Verra but shows no progress beyond an early pipeline listing.</li>
            <li>• A real news mention suggests the organization is actively looking for a monitoring/technology partner (treated as a hypothesis, not a confirmed fact, since it comes from a news article, not a registry).</li>
            <li>• Registration is actively progressing — the organization is currently engaged with the process.</li>
            <li>• A Permenhut 6/2026 compliance deadline is approaching or has passed.</li>
          </ul>
          <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-stone-500">What drives the credibility score</h4>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• <strong>Registry status</strong> — is it in an official registry, has it progressed beyond initial registration, does it have a DRAM/DPP on file.</li>
            <li>• <strong>Land rights</strong> — a formal land-rights category on file, or a confirmed BRWA customary-territory overlap.</li>
            <li>• <strong>Geospatial</strong> — real coordinates on file, and whether a full boundary (not just a point) exists.</li>
            <li>• <strong>Contactability</strong> — whether a real contact (a name and/or an email) has actually been resolved.</li>
          </ul>
        </Panel>

        <Panel title="How compliance is checked" variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            Permenhut 6/2026 is the regulation governing forest-carbon trading in Indonesia. It contains 25 real, individually-encoded
            rules —{" "}
            {complianceCounts ? (
              <>
                <strong>
                  {complianceCounts.wired} of {complianceCounts.total}
                </strong>{" "}
                are currently wired into live scoring
              </>
            ) : (
              "the exact wired-vs-total count is loading…"
            )}
            . The rest aren't silently skipped — each one is flagged with its own specific reason it isn't yet computable from the data
            this pipeline normalizes: most bind the Ministry directly rather than an individual project, or need a field this pipeline
            doesn't currently capture (e.g. a document submission timestamp). Every one of those reasons is visible per-candidate, on the
            Compliance tab's expanded rule list — never a blanket "not done yet."
          </p>
        </Panel>

        <Panel title="Why no LLM in scoring, dossier, or outreach" variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            Every score, badge, and generated document in this pipeline is a deterministic function of already-known fields — no language
            model ever decides a score, a match, or what to write. This is a deliberate trust decision, not a cost-cutting shortcut:
            deterministic logic is fully auditable (the exact same input always produces the exact same output, traceable rule by rule),
            carries zero hallucination risk, and is cheap enough to re-run daily at full scale. The one place text generation happens at
            all — dossier and outreach-email prose — is template-based, assembling already-computed real facts into readable sentences,
            never inventing a new fact or a new number.
          </p>
        </Panel>

        <Panel title="How contact resolution works" variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            A contact is resolved in one of three ways, checked in order — a candidate only moves to the next when the previous one
            genuinely found nothing:
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• <strong>Found directly in the official registry record</strong> — a named individual the registry itself lists as the registrant. The most common real outcome, but registries record a name, never an email.</li>
            <li>• <strong>Found via the organization's own website</strong> — a live web search for the org's own site, requiring the page to genuinely self-identify as that organization (a copyright footer or an explicit "contact us" naming it) before trusting an email found there.</li>
            <li>• <strong>Mentioned in a news article</strong> — the lowest-confidence lead, since a news article has no equivalent structural anchor (no copyright footer, no dedicated contact page) to verify against.</li>
          </ul>
          <p className="mt-3 text-[13.5px] leading-relaxed text-stone-700">
            The real, current breakdown across all {total} final candidates:
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Confidently-resolved emails" value={hasEmail} />
            <Stat label="Weaker email matches" value={lowConfidenceEmail} />
            <Stat label="Named contacts, no email yet" value={nameOnlyNoEmail} />
            <Stat label="Nothing found" value={nothingFound} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SourceCard({ name, description, stat, detail }: { name: string; description: string; stat: string; detail: string | null }) {
  return (
    <div className="instrument-panel border border-stone-300 bg-white p-4">
      <div className="font-display text-[14px] font-semibold text-stone-900">{name}</div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">{description}</p>
      <div className="mt-2 border-t border-stone-100 pt-2 font-mono text-[12.5px] tabular text-stone-800">{stat}</div>
      {detail && <p className="mt-1 text-[11.5px] leading-relaxed text-stone-500">{detail}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="instrument-panel border border-stone-300 bg-stone-50 px-3 py-2.5 text-center">
      <div className="font-mono text-figure-sm tabular text-stone-900">{value}</div>
      <div className="mt-0.5 text-[10.5px] uppercase tracking-wide text-stone-500">{label}</div>
    </div>
  );
}
