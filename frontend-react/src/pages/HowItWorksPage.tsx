import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useCandidates } from "../lib/CandidatesContext";
import { Panel } from "../components/ui/Panel";
import { useT } from "../lib/i18n";

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
  const { t } = useT();
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

  if (!candidates) return <div className="px-6 py-6 text-stone-400">{t("howItWorks.loading")}</div>;
  if (statsError) return (
    <div className="px-6 py-6 text-clay-700">
      {t("howItWorks.statsErrorPrefix")} {statsError}
    </div>
  );

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
        <h1 className="font-display text-2xl font-semibold text-stone-900">{t("howItWorks.title")}</h1>
        <p className="mt-1 text-[13.5px] text-stone-500">{t("howItWorks.subtitle")}</p>
      </div>

      <div className="max-w-4xl space-y-5">
        <Panel title={t("howItWorks.dataSources.title")} variant="instrument">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Terminology pass (2026-09-02) — plain label as the primary
                heading, real technical acronym kept in parens right next
                to it (this page IS the detail/explainer view, so the
                acronym stays visible, not just in a tooltip); body
                `description` text already explains each term in full and
                is left untouched. `stat`/`detail` stay English-only in
                both languages (2026-09-04 KO pass) — they're built from
                live sourceCount()/stats/pipeline_stats values, not fixed
                strings, so they're out of scope for this dictionary. */}
            <SourceCard
              name={t("howItWorks.source.sruk.name")}
              description={t("howItWorks.source.sruk.desc")}
              stat={`${sourceCount("sruk")} of ${total} final candidates`}
              detail={p ? `${p.sruk_and_srn_ppi_input} raw SRUK+SRN-PPI records fetched (combined — the pipeline doesn't currently split this raw count by source)` : null}
            />
            <SourceCard
              name={t("howItWorks.source.srnppi.name")}
              description={t("howItWorks.source.srnppi.desc")}
              stat={`${sourceCount("srn_ppi")} of ${total} final candidates`}
              detail={null}
            />
            <SourceCard
              name={t("howItWorks.source.verra.name")}
              description={t("howItWorks.source.verra.desc")}
              stat={`${sourceCount("verra")} of ${total} final candidates`}
              detail={p ? `${p.verra_input} raw Verra records fetched (before filtering to Indonesia-only, forestry-sector projects)` : null}
            />
            <SourceCard
              name={t("howItWorks.source.brwa.name")}
              description={t("howItWorks.source.brwa.desc")}
              stat={stats ? `${stats.brwa_territories.total.toLocaleString()} territories tracked` : "—"}
              detail={
                stats
                  ? `${stats.brwa_territories.with_geometry.toLocaleString()} (${Math.round((stats.brwa_territories.with_geometry / stats.brwa_territories.total) * 100)}%) have real boundary geometry on file — a confirmed ceiling for this data source, not an in-progress number`
                  : null
              }
            />
            <SourceCard
              name={t("howItWorks.source.tavily.name")}
              description={t("howItWorks.source.tavily.desc")}
              stat={`${sourceCount("news")} of ${total} final candidates discovered this way`}
              detail={p ? `${p.news_queries_run} real search queries run, ${p.news_hits_processed} hits processed` : null}
            />
          </div>
        </Panel>

        <Panel title={t("howItWorks.scoring.title")} variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            {t("howItWorks.scoring.introA")} <strong>{t("score.opportunity")}</strong>{" "}
            {t("howItWorks.scoring.betweenOppEvid")} <strong>{t("score.evidence")}</strong>{" "}
            {t("howItWorks.scoring.beforeNeverCombined")} <strong>{t("howItWorks.scoring.neverCombined")}</strong>{" "}
            {t("howItWorks.scoring.afterNeverCombined")}
          </p>
          <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {t("howItWorks.whatDrivesOpportunity")} <span title="need score" className="normal-case tracking-normal text-stone-400">(need score)</span>
          </h4>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• {t("howItWorks.opp.bullet1")}</li>
            <li>• {t("howItWorks.opp.bullet2")}</li>
            <li>• {t("howItWorks.opp.bullet3")}</li>
            <li>• {t("howItWorks.opp.bullet4")}</li>
            <li>• {t("howItWorks.opp.bullet5")}</li>
            <li>• {t("howItWorks.opp.bullet6")}</li>
          </ul>
          <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
            {t("howItWorks.whatDrivesEvidence")} <span title="credibility score" className="normal-case tracking-normal text-stone-400">(credibility score)</span>
          </h4>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• <strong>{t("howItWorks.evid.registryStatus.term")}</strong> — {t("howItWorks.evid.registryStatus.desc")}</li>
            <li>• <strong>{t("howItWorks.evid.landRights.term")}</strong> — {t("howItWorks.evid.landRights.desc")}</li>
            <li>• <strong>{t("howItWorks.evid.locationVerified.term")}</strong> <span title="Geospatial" className="text-stone-400">(Geospatial)</span> — {t("howItWorks.evid.locationVerified.desc")}</li>
            <li>• <strong>{t("howItWorks.evid.contactFound.term")}</strong> <span title="Contactability" className="text-stone-400">(Contactability)</span> — {t("howItWorks.evid.contactFound.desc")}</li>
          </ul>
        </Panel>

        <Panel title={t("howItWorks.compliance.title")} variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">
            {t("howItWorks.compliance.intro")}{" "}
            {complianceCounts ? (
              <>
                <strong>
                  {complianceCounts.wired} of {complianceCounts.total}
                </strong>{" "}
                {t("howItWorks.compliance.wiredSuffix")}
              </>
            ) : (
              t("howItWorks.compliance.loading")
            )}
            {t("howItWorks.compliance.rest")}
          </p>
        </Panel>

        <Panel title={t("howItWorks.noLlm.title")} variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">{t("howItWorks.noLlm.body")}</p>
        </Panel>

        <Panel title={t("howItWorks.contact.title")} variant="instrument">
          <p className="text-[13.5px] leading-relaxed text-stone-700">{t("howItWorks.contact.intro")}</p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-stone-700">
            <li>• <strong>{t("howItWorks.contact.registry.term")}</strong> — {t("howItWorks.contact.registry.desc")}</li>
            <li>• <strong>{t("howItWorks.contact.website.term")}</strong> — {t("howItWorks.contact.website.desc")}</li>
            <li>• <strong>{t("howItWorks.contact.news.term")}</strong> — {t("howItWorks.contact.news.desc")}</li>
          </ul>
          <p className="mt-3 text-[13.5px] leading-relaxed text-stone-700">
            {t("howItWorks.contact.breakdown").replace("{n}", String(total))}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("howItWorks.stat.confidentEmails")} value={hasEmail} />
            <Stat label={t("howItWorks.stat.weakEmails")} value={lowConfidenceEmail} />
            <Stat label={t("howItWorks.stat.namedNoEmailYet")} value={nameOnlyNoEmail} />
            <Stat label={t("howItWorks.stat.nothingFound")} value={nothingFound} />
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
