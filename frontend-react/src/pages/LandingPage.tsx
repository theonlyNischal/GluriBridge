import { Link } from "react-router-dom";
import { Users, Gauge, Mail, ArrowRight } from "lucide-react";
import { useCandidates } from "../lib/CandidatesContext";
import { KpiCard } from "../components/ui/KpiCard";
import { LanguageToggle } from "../components/ui/LanguageToggle";
import { useT } from "../lib/i18n";
import logo from "../assets/gluribridge-logo.png";

/**
 * Cold-open landing page (2026-09-03) — "/" moved here; the actual app
 * lives at "/dashboard" onward (see App.tsx's route split). Built for
 * someone opening the deployed link with no narration, NOT the live
 * demo walkthrough (which starts directly at /dashboard) — so this is
 * deliberately terse: one headline, one sentence, three real numbers,
 * one primary action. No feature list, no testimonials, nothing that
 * takes longer than ~10 seconds to read.
 *
 * Visual direction: matches the CURRENT app exactly (rounded
 * .instrument-panel cards, soft shadow, paper/topographic background,
 * same palette/type) — the 2026-09-02/03 rounded-and-shadowed pivot,
 * not the flat/hairline "field instrument" look that direction
 * superseded. Reuses KpiCard verbatim for the three proof points rather
 * than inventing a new stat-card shape, specifically so this reads as
 * the front door of the same product, not a separate marketing site.
 *
 * EN/KO toggle (2026-09-03, scope extended here from Dashboard-only) —
 * this cold-open front door is exactly the scenario a language choice
 * matters most in: no narrator to bridge the language the way the live
 * demo has. Same shared LanguageToggle/i18n.ts as the Dashboard; the
 * toggle sits top-right, same spot as the app shell's header.
 */
export function LandingPage() {
  const { candidates, error } = useCandidates();
  const { t } = useT();

  if (error) return <div className="flex min-h-screen items-center justify-center px-6 text-clay-700">Failed to load: {error}</div>;
  if (!candidates) return <div className="flex min-h-screen items-center justify-center px-6 text-stone-400">Loading…</div>;

  const total = candidates.length;
  const highOpp = candidates.filter((r) => r.need_score >= 70).length;
  const highEvid = candidates.filter((r) => r.credibility_score >= 70).length;
  // Honest contact figure (explicit ask, 2026-09-03) — "direct contact"
  // means a real email address is on file (any confidence level, high
  // or weaker); "named only" is the real, separate, larger bucket of
  // resolved-contact candidates with a registrant name but no email at
  // all. Never collapsed into one inflated total (e.g. resolvedContact,
  // 102) — same non-blending discipline the Dashboard's own Contact
  // ready / Also found split already established.
  const hasEmail = candidates.filter((r) => r.has_email).length;
  const lowConfidenceEmail = candidates.filter((r) => r.has_low_confidence_email).length;
  const directContacts = hasEmail + lowConfidenceEmail;
  const resolvedContact = candidates.filter((r) => r.has_resolved_contact).length;
  const namedOnly = resolvedContact - directContacts;

  return (
    <div className="topo-watermark bg-field-paper flex min-h-screen flex-col">
      <header className="flex items-center gap-2 px-8 py-6">
        <img src={logo} alt="GluriBridge" className="h-7 w-7 shrink-0" />
        <span className="font-display text-[15px] font-semibold text-stone-900">GluriBridge</span>
        <LanguageToggle className="ml-auto" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-forest-600">{t("landing.eyebrow")}</p>
        <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold text-stone-900 sm:text-5xl">{t("landing.headline")}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-stone-600">{t("landing.sentence")}</p>

        {/* Three real proof points — same live fetch as the rest of the
            app (CandidatesProvider, moved up to wrap this page too in
            App.tsx), never hardcoded. Reuses KpiCard exactly as the
            Dashboard's own hero row does. Deliberately NOT links — the
            one clickable action on this page is the primary CTA below,
            not three competing ones. */}
        <div className="mx-auto mt-10 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label={t("landing.kpi.candidates")} value={total} sub={t("landing.kpi.candidates.sub")} size="lg" icon={Users} variant="instrument" />
          <KpiCard
            label={t("landing.kpi.scored")}
            value={highOpp}
            sub={t("landing.kpi.scored.sub").replace("{n}", String(highEvid))}
            size="lg"
            icon={Gauge}
            variant="instrument"
          />
          <KpiCard
            label={t("landing.kpi.contacts")}
            value={directContacts}
            sub={t("landing.kpi.contacts.sub").replace("{n}", String(namedOnly))}
            size="lg"
            icon={Mail}
            variant="instrument"
          />
        </div>

        <Link
          to="/dashboard"
          className="mt-10 inline-flex items-center gap-2 rounded-lg bg-forest-600 px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-forest-700"
        >
          {t("landing.cta")}
          <ArrowRight size={16} strokeWidth={2.5} />
        </Link>

        <div className="mt-5 flex items-center gap-4 text-[12.5px]">
          <Link to="/how-it-works" className="text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            {t("nav.howItWorks")}
          </Link>
          <span className="text-stone-300">·</span>
          <Link to="/design-system" className="text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-stone-800">
            {t("nav.designSystem")}
          </Link>
        </div>

        {/* Small trust line (2026-09-03) — same two real, already-true
            claims from the Dashboard's own closing trust row, verbatim,
            not new marketing copy invented for this page. */}
        <p className="mt-4 text-[11.5px] text-stone-400">
          {t("dash.trust.noLlm")} · {t("dash.trust.independentAxes")}
        </p>
      </main>
    </div>
  );
}
