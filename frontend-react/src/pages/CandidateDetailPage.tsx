import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  FileText,
  FileSpreadsheet,
  MapPinned,
  File as FileIcon,
  ExternalLink,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mail,
  Target,
  ShieldCheck,
  MapPin,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  FolderX,
  CalendarClock,
  Phone,
  Globe,
  AtSign,
  Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useCandidates } from "../lib/CandidatesContext";
import { fmtScore, POLICY_TIER_LABEL, MATCH_STATUS_LABEL, LAND_RIGHTS_CATEGORY_LABEL, VERIFICATION_STATUS_LABEL } from "../lib/format";
import { applyCandidateFilter, searchParamsToFilterParams } from "../lib/candidateFilter";
import { useT, type StringKey } from "../lib/i18n";
import type { CandidateDetail, DocumentRef } from "../lib/types";
import { Panel } from "../components/ui/Panel";
import { RichnessBadge, SourceBadge } from "../components/ui/Badge";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ScoreStatCard } from "../components/ui/ScoreStatCard";
import { ScoreLabelPill } from "../components/ui/ScoreLabelPill";
import { ScoreComponentBar } from "../components/ui/ScoreComponentBar";
import { ReasonList } from "../components/ui/ReasonList";
import { InfoPopover } from "../components/ui/InfoPopover";
import { HonestState } from "../components/ui/HonestState";
import { CitationLink } from "../components/ui/CitationLink";
import { EvidenceTag } from "../components/ui/EvidenceTag";
import { ComplianceBadge } from "../components/ui/ComplianceBadge";
import { ActivityTypeBadges } from "../components/ui/ActivityTypeBadges";
import { WarningBanner } from "../components/ui/WarningBanner";
import { TerritoryMap } from "../components/TerritoryMap";

const TABS = ["overview", "compliance", "dossier", "outreach"] as const;
type Tab = (typeof TABS)[number];
const DOCS_COLLAPSED_COUNT = 8;

function isTab(v: string | null): v is Tab {
  return v !== null && (TABS as readonly string[]).includes(v);
}

type RailSection = { id: string; labelKey: StringKey; tab: Tab | null };

// The page's real sections, in real page order. `tab: null` sections are
// always mounted (hero, scores); everything else only actually exists in
// the DOM while its own tab is selected, so a click on one of those first
// switches to that tab, then scrolls — never jumps to something that
// isn't really there yet.
//
// `labelKey` (2026-09-04, EN/KO coverage) — these are module-level
// constants, outside any component, so they store a STRING KEY rather
// than the resolved text itself (no hook context available here); the
// rail/tabs bar resolve it to real text via t() at render time, inside
// the component.
const RAIL_SECTIONS: RailSection[] = [
  { id: "sec-hero", labelKey: "candidateDetail.section.whyContactFirst", tab: null },
  { id: "sec-scores", labelKey: "candidateDetail.section.scores", tab: null },
  { id: "sec-land-rights", labelKey: "candidateDetail.section.landRights", tab: "overview" },
  { id: "sec-documents", labelKey: "candidateDetail.section.documents", tab: "overview" },
  { id: "sec-evidence", labelKey: "candidateDetail.section.evidence", tab: "overview" },
  { id: "sec-compliance", labelKey: "candidateDetail.section.compliance", tab: "compliance" },
  { id: "sec-dossier", labelKey: "candidateDetail.section.dossier", tab: "dossier" },
  { id: "sec-contact", labelKey: "candidateDetail.section.contact", tab: "dossier" },
  { id: "sec-outreach", labelKey: "candidateDetail.section.outreach", tab: "outreach" },
];

// Tabs-bar label per tab (2026-09-04) — "overview" has no matching rail
// section by the same name (its rail entries are the finer Land Rights/
// Documents/Evidence split), so it gets its own key; the other three
// reuse the EXACT SAME key as their rail entry above, so the tabs bar and
// the rail always show the identical word for the identical section.
const TAB_LABEL_KEY: Record<Tab, StringKey> = {
  overview: "candidateDetail.tab.overview",
  compliance: "candidateDetail.section.compliance",
  dossier: "candidateDetail.section.dossier",
  outreach: "candidateDetail.section.outreach",
};

// Page-scoped Korean mirror of format.ts's English-only label maps
// (2026-09-04) — format.ts itself stays English-only/unchanged (other
// pages import it directly and must keep rendering exactly as before);
// this page looks up its own key alongside the existing English map at
// each render call site, via the koLabel() helper below. Partial<> since
// only the real schema values format.ts's own maps already cover need an
// entry — an unmapped raw value falls through to format.ts's own
// existing English fallback (usually `.replace(/_/g, " ")`), unchanged.
const VERIFICATION_STATUS_KO_KEY: Partial<Record<string, StringKey>> = {
  registry_confirmed: "candidateDetail.verificationStatus.registryConfirmed",
};
const LAND_RIGHTS_CATEGORY_KO_KEY: Partial<Record<string, StringKey>> = {
  PBPH: "candidateDetail.landRightsCategory.PBPH",
  perhutanan_sosial: "candidateDetail.landRightsCategory.perhutananSosial",
  hutan_adat: "candidateDetail.landRightsCategory.hutanAdat",
  hutan_hak: "candidateDetail.landRightsCategory.hutanHak",
  PB_PJL_karbon: "candidateDetail.landRightsCategory.pbPjlKarbon",
};
const POLICY_TIER_KO_KEY: Partial<Record<string, StringKey>> = {
  penetapan: "candidateDetail.policyTier.penetapan",
  pengaturan: "candidateDetail.policyTier.pengaturan",
  belum_ada: "candidateDetail.policyTier.belumAda",
};
const MATCH_STATUS_KO_KEY: Partial<Record<string, StringKey>> = {
  primary: "candidateDetail.matchStatus.primary",
  auto_merged: "candidateDetail.matchStatus.autoMerged",
};

// Resolves one of format.ts's raw-value -> English-label maps to Korean
// when uiLang is "ko" and a Korean key exists for that raw value;
// otherwise returns `enText` UNCHANGED — so the "en" branch is always the
// exact original expression (format.ts's own map lookup + its own
// fallback), never a new/different EN code path. This is what keeps EN
// rendering byte-identical to before this change.
function koLabel(raw: string, koMap: Partial<Record<string, StringKey>>, enText: string, uiLang: "en" | "ko", t: (key: StringKey) => string): string {
  if (uiLang === "ko") {
    const key = koMap[raw];
    if (key) return t(key);
  }
  return enText;
}

// The section each top TABS-bar button jumps to — 2026-08-31 fix. The
// tabs bar used to just call setTab(t) directly, a SEPARATE code path
// from the rail's own jump(), so switching tabs via the plain tabs bar
// changed `tab` (correct) but never touched the rail's own activeId
// (only nudged by scroll position) — the rail could stay stuck on
// whatever it last showed (typically "Scores", since hero/scores sit
// ABOVE every tab's content and don't move when the tab underneath them
// changes) even though the tabs bar itself had already switched. Fixed
// by making the tabs bar call the EXACT SAME jump() the rail uses,
// targeting each tab's own designated entry section — one function,
// one resulting (tab, activeId, scrollY), used identically by both.
const TAB_ENTRY_SECTION: Record<Tab, string> = {
  overview: "sec-land-rights",
  compliance: "sec-compliance",
  dossier: "sec-dossier",
  outreach: "sec-outreach",
};

export function CandidateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { candidates } = useCandidates();
  const [searchParams] = useSearchParams();
  const [rec, setRec] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Real deep-linking, not decorative — the Candidates list's "Generate
  // Dossier"/"Add to Outreach" row actions navigate here with ?tab=... so
  // they land on the actual real tab, not just the candidate's overview.
  const [tab, setTab] = useState<Tab>(() => (isTab(searchParams.get("tab")) ? (searchParams.get("tab") as Tab) : "overview"));
  const [lang, setLang] = useState<"en" | "id">("en");
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [notWiredExpanded, setNotWiredExpanded] = useState(false);
  // Invisible bottom spacer (2026-08-31) — the section rail can only ever
  // scroll a section flush under it if there's enough real page below
  // that section to physically scroll into; a short tab's last section(s)
  // otherwise land mid-screen no matter what the rail's own math does
  // (confirmed via a real click-through: Katingan's Documents/Contact/
  // Outreach, a thin candidate's Land Rights/Evidence/Dossier/Contact/
  // Outreach). This adds exactly enough dead space below the real content
  // — recomputed per tab/candidate, never a fixed guess — so every
  // rail-tracked section CAN reach the top. Nobody reading top-to-bottom
  // ever sees it (it's past the real content); it only exists for the
  // rail to scroll into.
  const [bottomSpacerPx, setBottomSpacerPx] = useState(0);
  const bottomSpacerPxRef = useRef(0);
  // The rail's real sections for THIS candidate (Documents/Evidence only
  // when this candidate actually has any) — the one shared list used by
  // the rail's own rendering, computeActive() below, jump(), and the
  // bottom-spacer effect, so none of them can silently diverge on what
  // "the sections that exist" even means.
  const visibleSections = useMemo(
    () =>
      RAIL_SECTIONS.filter((s) => {
        if (s.id === "sec-documents") return rec ? rec.documents.length > 0 : false;
        if (s.id === "sec-evidence") return rec ? rec.news_evidence.length > 0 : false;
        return true;
      }),
    [rec]
  );
  // Which rail item is highlighted — 2026-08-31 fix: this used to be
  // SectionRail's own LOCAL state, kept in sync with `tab` only via the
  // rail's own click handler + a scroll-position listener. The top TABS
  // bar changed `tab` through a completely separate path (a plain
  // setTab(t) with no connection to this), so switching tabs via the
  // tabs bar correctly updated `tab` (and the tabs bar itself, which
  // reads `tab` directly) but left this stuck on whatever it last
  // showed — typically "Scores", since hero/scores sit ABOVE every tab's
  // actual content and don't move when the tab underneath them changes,
  // so they can keep satisfying the scroll-position check even after the
  // tab switched. Now this state (and the jump()/computeActive() logic
  // that drives it) lives here, in the same component as `tab` itself,
  // and the tabs bar calls the EXACT SAME jump() the rail uses — one
  // source of truth, one code path, for both.
  const [activeId, setActiveId] = useState(RAIL_SECTIONS[0].id);
  // While a click-triggered smooth-scroll is in flight, the organic
  // scroll listener below is suppressed (see jump()) so it can't
  // overwrite the just-clicked section with something computed from an
  // in-between scroll position mid-animation.
  const suppressSpyRef = useRef(false);
  const resumeSpyTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    function computeActive() {
      if (suppressSpyRef.current) return;
      const mounted = visibleSections.filter((s) => s.tab === null || s.tab === tab);
      let current = mounted[0]?.id;
      for (const s of mounted) {
        const el = document.getElementById(s.id);
        // 140px accounts for the sticky header (48px) + this rail
        // (~44px) + a small margin — a section counts as "current" once
        // its top has scrolled up past that real fixed chrome.
        if (el && el.getBoundingClientRect().top <= 140) current = s.id;
      }
      // A section near the bottom of a short tab (or the last section in
      // ANY tab) can have less real content below its own header than
      // the 140px rule above needs to ever scroll flush under the rail —
      // confirmed via manual testing on both Katingan's Documents panel
      // (91 real documents, still the LAST section in its tab) and a
      // thin candidate's Land Rights/Evidence panels, which sit close
      // enough together that neither could reach 140px. Once the page
      // truly can't scroll any further, re-sweep with a much more
      // generous line (60% down the viewport) so whichever section
      // actually dominates the visible screen at that point wins,
      // instead of leaving the highlight stuck on whatever was last
      // reachable under the strict 140px rule. A section too short to
      // ever cross even that generous line (a one-line "Evidence" panel
      // trailing right at the very bottom, for example) simply won't
      // out-rank the section above it that's filling most of the
      // screen — clicking that section's own rail item still jumps to
      // and correctly highlights it every time; only pure mouse-wheel
      // scrolling past it is affected, not navigation.
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        const generousLine = window.innerHeight * 0.6;
        for (const s of mounted) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= generousLine) current = s.id;
        }
      }
      if (current) setActiveId(current);
    }
    computeActive();
    window.addEventListener("scroll", computeActive, { passive: true });
    return () => window.removeEventListener("scroll", computeActive);
  }, [tab, visibleSections]);

  function jump(section: RailSection) {
    function scrollToIt() {
      const el = document.getElementById(section.id);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 92;
      // Reflect the CLICKED section immediately and honestly, regardless
      // of whether the physical scroll can actually reach "flush below
      // the rail" — on a short tab, the browser clamps the scroll short
      // of that target (there isn't enough page left to scroll), and
      // without this, the rail would end up highlighting a different
      // (often the wrong) section once the organic scroll-spy above
      // recomputed from wherever the clamped scroll actually landed.
      setActiveId(section.id);
      suppressSpyRef.current = true;
      window.clearTimeout(resumeSpyTimerRef.current);
      window.scrollTo({ top: y, behavior: "smooth" });
      // Real smooth-scrolls of the distances on this page settle well
      // within this window; once it's up, organic scrolling (mouse
      // wheel, trackpad, keyboard) resumes driving the highlight as
      // normal, including the at-bottom rule above.
      resumeSpyTimerRef.current = window.setTimeout(() => {
        suppressSpyRef.current = false;
      }, 700);
    }
    if (section.tab && section.tab !== tab) {
      // Set the highlight AND suppress organic scroll-spy the instant the
      // click happens, not after the tab switch settles — found via a
      // real screenshot taken ~50ms into a cross-tab click: the OLD
      // section was still shown active for a brief moment (the tab's
      // content had already switched underneath it, just the rail hadn't
      // caught up yet). Switching `tab` re-runs the scroll-spy effect
      // immediately on this same commit, and without suppressing it here
      // too (not just inside scrollToIt below, which only runs after the
      // double rAF delay), that effect would recompute from wherever the
      // page happened to be scrolled BEFORE the intended scroll, briefly
      // showing something other than the clicked section.
      setActiveId(section.id);
      suppressSpyRef.current = true;
      window.clearTimeout(resumeSpyTimerRef.current);
      // Switch tabs first, then scroll once the new tab's content has
      // actually mounted (one rAF for React's commit, one more for the
      // browser's next paint/layout) — scrolling immediately would
      // target an element that doesn't exist in the DOM yet.
      setTab(section.tab);
      requestAnimationFrame(() => requestAnimationFrame(scrollToIt));
    } else {
      scrollToIt();
    }
  }

  useEffect(() => {
    if (!id) return;
    api
      .getCandidate(id)
      .then(setRec)
      .catch((e) => setError(String(e.message ?? e)));
    // Re-sync the active tab from the URL whenever the candidate changes
    // (not just on first mount) — covers a row action navigating here
    // while the detail page for a DIFFERENT candidate is already mounted,
    // which react-router reuses rather than remounting.
    const t = searchParams.get("tab");
    setTab(isTab(t) ? t : "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Recomputes the invisible bottom spacer above whenever the current
  // tab, candidate, or documents-expanded state changes (each can change
  // which section is physically last, or how tall the page naturally is).
  // Declared before the early returns below (rules of hooks — every hook
  // must run unconditionally) but no-ops via the `!rec` guard until a
  // candidate has actually loaded.
  useEffect(() => {
    if (!rec) return;
    function recompute() {
      const mounted = visibleSections.filter((s) => s.tab === null || s.tab === tab);
      let maxTop = 0;
      for (const s of mounted) {
        const el = document.getElementById(s.id);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (top > maxTop) maxTop = top;
        }
      }
      // Back out whatever spacer WE already applied to get the page's true
      // natural height, not a measurement inflated by our own last pass —
      // otherwise this would ratchet upward forever.
      const naturalHeight = document.documentElement.scrollHeight - bottomSpacerPxRef.current;
      const needed = Math.max(0, Math.round(maxTop - 92 + window.innerHeight - naturalHeight));
      bottomSpacerPxRef.current = needed;
      setBottomSpacerPx(needed);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [rec, tab, docsExpanded, notWiredExpanded, visibleSections]);

  // Prev/next through the EXACT curated set the user was actually looking
  // at on the Candidates list — not the raw 144 in default order. Reuses
  // the identical filter+sort function the list page itself runs,
  // against the same shared `candidates` array, keyed off the same query
  // params that traveled here in the URL (see lib/candidateFilter.ts).
  // Falls back to an empty set (no prev/next shown) if the shared list
  // hasn't loaded yet, or if this candidate isn't actually in the
  // filtered set at all (e.g. a stale/hand-edited URL).
  const orderedSet = useMemo(() => {
    if (!candidates) return [];
    return applyCandidateFilter(candidates, searchParamsToFilterParams(searchParams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, searchParams.toString()]);
  const currentIndex = orderedSet.findIndex((r) => r.candidate_id === id);
  const prevRow = currentIndex > 0 ? orderedSet[currentIndex - 1] : null;
  const nextRow = currentIndex >= 0 && currentIndex < orderedSet.length - 1 ? orderedSet[currentIndex + 1] : null;

  function goToSibling(targetId: string) {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", tab); // preserve whichever tab is currently open
    navigate(`/candidates/${targetId}?${sp.toString()}`);
  }

  // Renamed to `uiLang` (2026-09-04) — this page already has its own
  // local `lang` state above for the Outreach draft's EN/ID toggle (a
  // completely separate axis: which language the backend-generated email
  // draft renders in, never touched by this change). `uiLang` is this
  // page's OWN UI chrome language, from the app-wide language context.
  const { t, lang: uiLang } = useT();

  if (error) return <div className="p-8 text-clay-700">{t("candidateDetail.error.failedToLoad").replace("{error}", error)}</div>;
  if (!rec) return <div className="p-8 text-stone-400">{t("candidateDetail.loading")}</div>;

  const { identity, scoring, land_rights, location, identity_resolution, documents, news_evidence, dossier, outreach, status, activity_type, contact } = rec;
  const ids = identity.registry_ids;
  const urls = identity.registry_source_urls;
  // url is null whenever the source has no real per-record public page in
  // its raw scraped data (currently true for SRUK/SRN-PPI in every real
  // case) — those render as plain reference text, never a fabricated link.
  // Terminology pass (2026-09-02) — kept the acronym as the visible label
  // here (same exception as SourceBadge): this is a compact registry-ID
  // reference row (Identity panel), and a registry ID is inherently a
  // technical/official reference — "SRUK: REG-11-..." reads more
  // credible/precise here than a long plain-language prefix would. The
  // plain name is threaded through as `plainLabel` for the tooltip instead.
  const idBits: { label: string; plainLabel: string; value: string; url: string | null }[] = [
    ids.sruk_registry_no && { label: "SRUK", plainLabel: t("candidateDetail.tracking.carbonRegistry"), value: ids.sruk_registry_no, url: urls.sruk },
    ids.srn_ppi_registry_no && { label: "SRN-PPI", plainLabel: t("candidateDetail.tracking.climateRegistry"), value: ids.srn_ppi_registry_no, url: urls.srn_ppi },
    ids.verra_project_id && { label: "Verra", plainLabel: t("candidateDetail.tracking.internationalRegistry"), value: ids.verra_project_id, url: urls.verra },
  ].filter((x): x is { label: string; plainLabel: string; value: string; url: string | null } => Boolean(x));
  const sources = [...new Set(identity_resolution.merge_history.map((m) => m.source))];

  // "Back to candidates" needs the SAME filter/sort query the list had
  // (minus `tab`, which is only meaningful on this page) so returning
  // doesn't silently reset the user's search/filter/sort.
  const backSearchParams = new URLSearchParams(searchParams);
  backSearchParams.delete("tab");
  const backHref = `/candidates${backSearchParams.toString() ? `?${backSearchParams.toString()}` : ""}`;

  return (
    <div className="topo-watermark bg-field-paper px-6 py-6">
      <div className="mb-3 flex items-center justify-between">
        {/* Real navigation back to the list — previously missing entirely
            (the sidebar's "Candidates" link was the only way out, and it
            resets any search/sort/filter state the list had). A direct
            Link, not history-back — predictable regardless of how this
            page was reached (row click, a deep link, a bookmark). */}
        <Link to={backHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-stone-500 hover:text-forest-700">
          <ArrowLeft size={14} /> {t("candidateDetail.nav.backToCandidates")}
        </Link>

        {/* Prev/next through the exact filtered+sorted set the user was
            browsing on the list — see the orderedSet/currentIndex memo
            above. Hidden entirely (not just disabled) when there's no
            real curated context to step through, e.g. arriving via a
            direct link with no query params at all and an unloaded/empty
            shared list. */}
        {orderedSet.length > 0 && currentIndex >= 0 && (
          <div className="flex items-center gap-2 text-[12.5px] text-stone-500">
            <span className="font-mono tabular">
              {uiLang === "ko"
                ? t("candidateDetail.nav.ofCount").replace("{a}", String(currentIndex + 1)).replace("{b}", String(orderedSet.length))
                : `${currentIndex + 1} of ${orderedSet.length}`}
            </span>
            <button
              onClick={() => prevRow && goToSibling(prevRow.candidate_id)}
              disabled={!prevRow}
              title={
                prevRow
                  ? t("candidateDetail.nav.previous").replace("{name}", prevRow.name)
                  : t("candidateDetail.nav.noPrevious")
              }
              className="rounded p-1 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => nextRow && goToSibling(nextRow.candidate_id)}
              disabled={!nextRow}
              title={
                nextRow
                  ? t("candidateDetail.nav.next").replace("{name}", nextRow.name)
                  : t("candidateDetail.nav.noNext")
              }
              className="rounded p-1 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <SectionRail visibleSections={visibleSections} activeId={activeId} onJump={jump} />

      {/* Two-column layout (2026-08-31) — the Key Gaps sidebar is
          persistent across every tab (not just Overview), so the split
          wraps the hero + tabs + tab-content together, not any one tab's
          content alone. The bottom spacer stays outside this row — it's
          about the overall page's scrollable height for the rail's
          scroll-to mechanism, which only ever measures sections inside
          the main column anyway. */}
      <div className="flex gap-5">
      <div className="min-w-0 flex-1">
      {/* ---------- hero ---------- */}
      <div className="instrument-panel border border-stone-300 bg-white p-5">
        <h1 className="font-display text-2xl font-semibold leading-tight text-stone-900">{identity.name}</h1>
        <div className="mt-1 text-[14px] text-stone-500">{identity.org ?? "—"}</div>

        {/* Top badge row (2026-08-31) — real activity-type classification
            (see activity_type.py's module docstring) plus a real
            province+district badge, together, right under the identity
            header: both are real facts about what/where this candidate's
            project actually is, read before the why-contact-first
            recommendation below. Province used to ALSO show again further
            down this page (the RichnessBadge row) — real duplication, not
            a deliberate two-purpose design; district (which had no home
            up here) now joins it, and the bottom row drops both, keeping
            only what's actually about that row's own theme (data
            richness/verification), not location. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
            <MapPin size={11} />
            {identity.province ?? <HonestState kind="no_data" label={t("province.notAvailable")} compact />}
            {identity.district ? ` · ${identity.district}` : ""}
          </span>
          {/* compact (2026-08-31 fix) — this badge row sits right below
              the identity header, alongside the province chip (already
              compact); the Unclassified/Not-applicable case was the one
              badge here still rendering its full explanation as a big
              inline box instead of the same tooltip-on-hover treatment
              used everywhere else this component appears (the Candidates
              table, the card grid). The real categories (when present)
              render identically either way — compact only changes the
              Unclassified/Not-applicable fallback. */}
          <ActivityTypeBadges activityType={activity_type} compact />
        </div>

        {/* ---------- WHY CONTACT THIS CANDIDATE — the page's real visual
            hero (2026-08-30 restructure). Gluri's own stated Q&A framing
            ("why a given candidate should be contacted first", "what to
            propose in that first outreach") is now the first substantive
            thing visible, not something read into two score cards or a
            wall of evidence panels below. Every word and badge inside
            WhyContactFirst is the same real field already used elsewhere
            on this page (score_label, compliance badge,
            dossier.suggested_poc, contact_route) — this only changes HOW
            prominently they're shown, never what they say. The bare
            ScoreLabelPill that used to sit here on its own, duplicating
            the one inside the box below, is gone. */}
        <div id="sec-hero" className="mt-3">
          <WhyContactFirst scoring={scoring} dossier={dossier} />
        </div>

        {/* Need and Credibility — deliberately identical size, weight, and
            treatment RELATIVE TO EACH OTHER. Never ranked against each
            other: a candidate can be low on one and high on the other
            (Katingan: need 11.1, credibility 88.2, this project's single
            best-evidenced candidate all session) and neither number is
            "worse". Demoted as a PAIR to a secondary position below the
            recommendation above (smaller figures, thinner accent border,
            tighter card — see ScoreStatCard) so the page's dominant
            visual element is "why contact this candidate", not the raw
            numbers — but the two cards remain identical to each other. */}
        <div id="sec-scores" className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <ScoreStatCard axis="need" label={t("score.opportunity")} value={scoring.need_score} accent="clay" icon={Target}>
            <ReasonList reasons={scoring.need_detection_reasons} emptyText={t("candidateDetail.need.noGapDetected")} kind="need" citationDisplay="popover" />
          </ScoreStatCard>
          <ScoreStatCard
            axis="credibility"
            label={t("score.evidence")}
            value={scoring.credibility_score}
            capped={scoring.credibility_capped}
            cappedReason={t("candidateDetail.credibility.cappedReason")}
            accent="forest"
            icon={ShieldCheck}
          >
            <ScoreComponentBar label={t("candidateDetail.credibility.registryStatus")} component={scoring.credibility_components.registry_status} />
            <ScoreComponentBar label={t("candidateDetail.panel.landRights")} component={scoring.credibility_components.land_rights} />
            <ScoreComponentBar label={t("candidateDetail.credibility.locationVerified")} title={t("candidateDetail.credibility.geospatial")} component={scoring.credibility_components.geospatial} />
            <ScoreComponentBar label={t("candidateDetail.credibility.contactFound")} title={t("candidateDetail.credibility.contactability")} component={scoring.credibility_components.contactability} />
          </ScoreStatCard>
        </div>

        {/* Data-quality row, location-free (2026-08-31) — province/district
            used to also render here, duplicating the top badge row with no
            real reason to; this row's own theme is data richness/
            verification status, not location, so it now shows only that. */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-stone-100 pt-3">
          <RichnessBadge richness={identity.data_richness} />
          {/* Terminology pass (2026-09-02): "registry_confirmed" now
              renders as "Officially Verified" via VERIFICATION_STATUS_LABEL
              (lib/format.ts); "unverified" falls back to its old raw-replace
              rendering unchanged, since it wasn't part of this round's ask. */}
          <span title={identity.verification_status.replace(/_/g, " ")} className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-stone-500">
            {koLabel(
              identity.verification_status,
              VERIFICATION_STATUS_KO_KEY,
              VERIFICATION_STATUS_LABEL[identity.verification_status] ?? identity.verification_status.replace(/_/g, " "),
              uiLang,
              t
            )}
          </span>
        </div>

      </div>

      {/* ---------- tabs ---------- */}
      {/* 2026-08-31 restyle — a thin 2px underline on a borderless row read
          as one more line of content, not a navigation control (real user
          feedback, checked fresh against the just-fixed tab-bar/rail state
          unification rather than assumed correct). Now a real segmented
          control: a bordered stone band gives it breathing room from the
          hero above and the tab content below, and the active tab gets an
          actual filled treatment (white pill + shadow), not just a color
          change — same forest/stone palette used everywhere else on this
          page (the rail's own active-pill treatment, ComplianceBadge,
          ScoreLabelPill), no new colors introduced. */}
      <div className="mt-4 flex gap-1 rounded-lg border border-stone-200 bg-stone-100 p-1">
        {/* Loop var renamed tabKey (2026-09-04, was `t`) — this page's
            translate function is also called `t` (useT() above); the old
            `TABS.map((t) => ...)` shadowed it inside this block, which
            would have silently broken every t() call added below it. */}
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            // Calls the EXACT SAME jump() the rail uses (2026-08-31 fix),
            // targeting this tab's own designated entry section, instead
            // of a bare setTab(t) — see TAB_ENTRY_SECTION's comment for
            // why the two need to be identical, not just both writing
            // the same `tab` state.
            onClick={() => jump(RAIL_SECTIONS.find((s) => s.id === TAB_ENTRY_SECTION[tabKey])!)}
            className={`flex-1 rounded-md px-4 py-2 text-[13px] font-semibold capitalize transition ${
              tab === tabKey ? "bg-white text-forest-700 shadow-sm" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {t(TAB_LABEL_KEY[tabKey])}
          </button>
        ))}
      </div>

      {/* ---------- overview ---------- */}
      {tab === "overview" && (
        <div className="mt-4 space-y-4">
          <Panel id="sec-land-rights" title={t("candidateDetail.panel.landRights")} className="!p-4" variant="instrument">
            <div className="space-y-3">
              {land_rights.land_rights_category ? (
                <div className="rounded-lg border border-forest-200 bg-forest-50 px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-forest-600">{t("candidateDetail.landRights.formalCategoryHeading")}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    {/* Terminology pass (2026-09-02): the 5 real
                        land_rights_category values (PBPH/perhutanan_sosial/
                        hutan_adat/hutan_hak/PB_PJL_karbon) now render via
                        LAND_RIGHTS_CATEGORY_LABEL — plain English, real
                        technical term kept as a hover title. */}
                    <span
                      title={land_rights.land_rights_category.replace(/_/g, " ")}
                      className="text-[14px] font-medium capitalize text-forest-800"
                    >
                      {koLabel(
                        land_rights.land_rights_category,
                        LAND_RIGHTS_CATEGORY_KO_KEY,
                        LAND_RIGHTS_CATEGORY_LABEL[land_rights.land_rights_category] ?? land_rights.land_rights_category.replace(/_/g, " "),
                        uiLang,
                        t
                      )}
                    </span>
                    {land_rights.brwa_overlap && (
                      <span className="text-[12px] text-forest-700">
                        {t("candidateDetail.landRights.via")}{" "}
                        {land_rights.brwa_overlap.territory_source_url ? (
                          <a href={land_rights.brwa_overlap.territory_source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-forest-300 underline-offset-2 hover:text-forest-900">
                            {land_rights.brwa_overlap.territory_name} ↗
                          </a>
                        ) : (
                          land_rights.brwa_overlap.territory_name
                        )}
                      </span>
                    )}
                  </div>
                  {land_rights.brwa_overlap?.legal_documents.length ? (
                    <ul className="mt-2 space-y-1">
                      {land_rights.brwa_overlap.legal_documents.map((d, i) => (
                        <li key={i}>
                          <a href={d.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900">
                            {d.description}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-2">
                      <HonestState kind="no_source" label={t("candidateDetail.landRights.noDecreeDocument")} compact />
                    </div>
                  )}
                </div>
              ) : land_rights.brwa_overlap ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5">
                  <div title="BRWA spatial overlap" className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">{t("candidateDetail.landRights.overlapFoundHeading")}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                    <dt className="text-stone-500">{t("candidateDetail.landRights.territory")}</dt>
                    <dd className="text-stone-800">
                      {land_rights.brwa_overlap.territory_source_url ? (
                        <a href={land_rights.brwa_overlap.territory_source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900">
                          {land_rights.brwa_overlap.territory_name} ↗
                        </a>
                      ) : (
                        land_rights.brwa_overlap.territory_name
                      )}
                    </dd>
                    <dt className="text-stone-500">{t("candidateDetail.landRights.relationship")}</dt>
                    <dd className="text-stone-800 capitalize">
                      {land_rights.brwa_overlap.relationship} ({land_rights.brwa_overlap.distance_km} km)
                    </dd>
                    <dt className="text-stone-500">{t("candidateDetail.landRights.legalRecognitionStatus")}</dt>
                    <dd className="text-stone-800">
                      {koLabel(
                        land_rights.brwa_overlap.policy_tier,
                        POLICY_TIER_KO_KEY,
                        POLICY_TIER_LABEL[land_rights.brwa_overlap.policy_tier] ?? land_rights.brwa_overlap.policy_tier,
                        uiLang,
                        t
                      )}
                    </dd>
                  </dl>
                </div>
              ) : (
                <HonestState
                  kind="not_checked"
                  label={t("candidateDetail.landRights.notYetChecked")}
                  compact
                  title={t("candidateDetail.landRights.notYetCheckedTitle")}
                />
              )}
              <TerritoryMap latitude={location.latitude} longitude={location.longitude} geoFlaggedReason={location.geo_flagged_reason} brwaOverlap={land_rights.brwa_overlap} />
            </div>
          </Panel>

          <Panel title={t("candidateDetail.panel.identityResolution")} className="!p-4" variant="instrument">
            <div className="divide-y divide-stone-100">
              {identity_resolution.merge_history.map((m, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 text-[13px]">
                  <SourceBadge source={m.source} />
                  <span className="text-stone-500">
                    {koLabel(m.match_status, MATCH_STATUS_KO_KEY, MATCH_STATUS_LABEL[m.match_status] ?? m.match_status, uiLang, t)}
                    {m.match_score !== undefined && <> · {t("candidateDetail.identityResolution.score")} {fmtScore(m.match_score)}</>}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {documents.length > 0 && <DocumentsPanel documents={documents} expanded={docsExpanded} onToggle={() => setDocsExpanded((v) => !v)} />}

          {news_evidence.length > 0 && (
            <Panel id="sec-evidence" title={t("candidateDetail.panel.newsEvidenceCount").replace("{n}", String(news_evidence.length))} className="!p-4" variant="instrument">
              <ul className="space-y-2">
                {news_evidence.map((n, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <EvidenceTag level={n.evidence_level} />
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-stone-700 hover:text-teal-900">
                      {n.title}
                    </a>
                    <span className="font-mono text-[11px] text-stone-400">{t("candidateDetail.news.match")} {fmtScore(n.match_score)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {/* ---------- compliance ---------- */}
      {tab === "compliance" && (
        <div id="sec-compliance" className="mt-4 space-y-4">
          {scoring.compliance.deadline && (
            <div className="rounded-xl border border-compliance-amber/30 bg-compliance-amberBg p-4 text-center">
              <div className="font-mono text-figure text-compliance-amber">{scoring.compliance.days_until_deadline}</div>
              {/* "Permenhut 6/2026 Pasal 61" (title attr) is a real Indonesian
                  legal citation — kept verbatim/untranslated, same as every
                  other Pasal reference on this page. */}
              <div title="Permenhut 6/2026 Pasal 61" className="mt-1 text-[13px] text-stone-600">
                {t("candidateDetail.compliance.daysRemainingUntil").replace("{date}", scoring.compliance.deadline)}
              </div>
            </div>
          )}
          <Panel title={t("candidateDetail.compliance.panelTitle")} className="!p-4" variant="instrument">
            <div className="space-y-3">
              <ComplianceRuleRow rule_id={scoring.compliance.rule_id} badge={scoring.compliance.badge} reason={scoring.compliance.reason} primary />
              {scoring.compliance.other_rules.map((r, i) => (
                <ComplianceRuleRow key={i} rule_id={r.rule_id} badge={r.badge} reason={r.reason} />
              ))}
            </div>
          </Panel>
          {/* Demoted (2026-08-31) — real user feedback: this section,
              even after progressive disclosure trimmed each row to one
              line, was still a bordered panel with equal visual weight
              to the 4 rules actually wired into this candidate's real
              score. Honest and worth keeping for auditability, but
              shouldn't compete for attention with what's actually
              scored. No Panel wrapper, no border, no expand toggle
              visible by default — a single small, muted sentence; the
              full per-rule detail (real, specific reason text, same
              InfoPopover treatment as before) is still reachable, just
              one deliberate click further away, via a de-emphasized text
              link rather than a second bordered section. */}
          <p className="text-[12px] leading-relaxed text-stone-400">
            {t("candidateDetail.compliance.additionalRulesNote").replace("{n}", String(scoring.compliance.not_wired_rules.length))}{" "}
            <button onClick={() => setNotWiredExpanded((v) => !v)} className="font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 hover:text-forest-700">
              {notWiredExpanded ? t("candidateDetail.compliance.hideFullRuleCoverage") : t("candidateDetail.compliance.showFullRuleCoverage")}
            </button>
          </p>
          {notWiredExpanded && (
            <ul className="space-y-1.5">
              {scoring.compliance.not_wired_rules.map((r) => (
                <li key={r.rule_id} className="flex items-center gap-3 text-[12.5px]">
                  {r.pasal !== "-" && <span className="shrink-0 whitespace-nowrap rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10.5px] text-stone-500">{r.pasal}</span>}
                  <span className="text-stone-400 italic">{t("candidateDetail.compliance.notWired")}</span>
                  <InfoPopover>
                    <div className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">{t("candidateDetail.compliance.why")}</div>
                    <p className="mt-1 text-stone-700">{r.reason}</p>
                  </InfoPopover>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------- dossier ---------- */}
      {tab === "dossier" && (
        <div className="mt-4 space-y-4">
          <Panel id="sec-dossier" title={t("candidateDetail.dossier.whyGluri")} className="!p-4" variant="instrument">
            <ReasonList reasons={dossier.structured.why_gluri} kind="need" />
          </Panel>
          {dossier.structured.land_and_regulatory && (
            <Panel title={t("candidateDetail.dossier.landRegulatoryPosition")} className="!p-4" variant="instrument">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] text-stone-700">{dossier.structured.land_and_regulatory.land_rights_text}</p>
                <CitationLink citation={dossier.structured.land_and_regulatory.land_rights_citation} />
              </div>
              <p className="mt-2 text-[13.5px] text-stone-700">{dossier.structured.land_and_regulatory.compliance_text}</p>
            </Panel>
          )}
          <Panel id="sec-contact" title={t("candidateDetail.dossier.contactRoute")} className="!p-4" variant="instrument">
            <p className="text-[13.5px] text-stone-700">{dossier.structured.contact_route}</p>
            {/* Phone/WhatsApp (2026-09-01) — a real, direct contact channel,
                shown the same way as the contact route above. general_office_line
                is flagged with its own small label since it's a genuinely
                different kind of number (reaches the org, not necessarily a
                specific person) — never silently presented as equivalent to a
                personal WhatsApp. Omitted entirely when no phone is on file;
                the existing contact-readiness indicators elsewhere already
                cover that absence, not duplicated here. */}
            {contact?.phone && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-[13.5px] text-stone-700">
                <Phone size={14} className="shrink-0 text-stone-400" aria-hidden />
                <span>{contact.phone}</span>
                {contact.phone_confidence === "general_office_line" && (
                  <span title={t("candidateDetail.dossier.generalOfficeLine")} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-500">
                    {t("candidateDetail.dossier.mainOffice")}
                  </span>
                )}
              </div>
            )}
          </Panel>
          <Panel title={t("candidateDetail.dossier.suggestedPoc")} className="!p-4" variant="instrument">
            <p className="text-[13.5px] text-stone-700">{dossier.structured.suggested_poc}</p>
          </Panel>
          {/* Public presence (2026-09-01) — deliberately its own panel, never
              merged into the contact panels above: a website/Facebook/
              Instagram is a place to find the org, not a way to message them
              directly. Omitted entirely when none of the three are on file. */}
          {(contact?.website_url || contact?.facebook_url || contact?.instagram_handle) && (
            <Panel title={t("candidateDetail.dossier.publicPresence")} className="!p-4" variant="instrument">
              <p className="mb-2 text-[12px] italic text-stone-500">{t("candidateDetail.dossier.publicPresenceNote")}</p>
              <div className="flex flex-wrap gap-4 text-[13px]">
                {contact?.website_url && (
                  <a href={contact.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-forest-700 hover:underline">
                    <Globe size={14} aria-hidden /> {t("candidateDetail.dossier.website")}
                  </a>
                )}
                {/* Facebook/Instagram — real platform brand names, left
                    untranslated (same discipline as SRUK/BRWA/Verra
                    elsewhere: a proper noun, not UI copy). */}
                {contact?.facebook_url && (
                  <a href={contact.facebook_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-forest-700 hover:underline">
                    <Link2 size={14} aria-hidden /> Facebook
                  </a>
                )}
                {contact?.instagram_handle && (
                  <a href={`https://www.instagram.com/${contact.instagram_handle}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-forest-700 hover:underline">
                    <AtSign size={14} aria-hidden /> Instagram
                  </a>
                )}
              </div>
            </Panel>
          )}
          {dossier.structured.dpp_validation_proxy.length > 0 && (
            <Panel title={t("candidateDetail.dossier.dppValidationTitle")} className="!p-4" variant="instrument">
              <ReasonList reasons={dossier.structured.dpp_validation_proxy} />
            </Panel>
          )}
          {dossier.structured.next_questions.length > 0 && (
            <Panel title={t("candidateDetail.dossier.nextQuestions")} className="!p-4" variant="instrument">
              <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] text-stone-700">
                {dossier.structured.next_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      )}

      {/* ---------- outreach ---------- */}
      {tab === "outreach" && (
        <div id="sec-outreach" className="mt-4">
          <Panel title={t("candidateDetail.outreach.panelTitle")} className="!p-4" variant="instrument">
            {!outreach || outreach.structured.recipient_status === "insufficient_contact" ? (
              <HonestState
                kind="insufficient"
                label={t("candidateDetail.outreach.cannotGenerate")}
                compact
                title={outreach?.structured.warnings?.[0] ?? t("candidateDetail.outreach.insufficientContactInfo")}
              />
            ) : (
              <div>
                {outreach.structured.warnings.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {outreach.structured.warnings.map((w, i) => (
                      <WarningBanner key={i} message={w} />
                    ))}
                  </div>
                )}
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="font-semibold text-stone-500">{t("candidateDetail.outreach.to")}</dt>
                  <dd className="text-stone-800">{outreach.structured.to ?? t("candidateDetail.outreach.notOnFile")}</dd>
                  <dt className="font-semibold text-stone-500">{t("candidateDetail.outreach.subject")}</dt>
                  {/* `lang` here is the OUTREACH DRAFT's own EN/ID toggle
                      (this component's local state, above) — a completely
                      separate axis from this page's UI-chrome language
                      (`uiLang`); never touched by this translation pass. */}
                  <dd className="text-stone-800">{lang === "en" ? outreach.structured.subject_en : outreach.structured.subject_id}</dd>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="inline-flex overflow-hidden rounded-md border border-stone-200 text-[12px] font-semibold">
                    <button onClick={() => setLang("en")} className={`px-3 py-1 ${lang === "en" ? "bg-forest-600 text-white" : "bg-white text-stone-500"}`}>
                      EN
                    </button>
                    <button onClick={() => setLang("id")} className={`px-3 py-1 ${lang === "id" ? "bg-forest-600 text-white" : "bg-white text-stone-500"}`}>
                      ID
                    </button>
                  </div>
                  {/* Real mailto action — opens the user's own local email
                      client, no in-app sending, no new backend. Keyed off
                      `to` being a non-null real email — NOT off
                      recipient_status's name alone: "name_only_no_email"
                      means exactly what it says (a name, no email; to is
                      null), it's "ready" and "email_only_no_name" whose
                      backend logic (outreach.py's `_recipient_status` /
                      the `"to": contact.email if status in ("ready",
                      "email_only_no_name") else None` line) actually
                      populates a real address. Checking `to` directly is
                      both simpler and the one condition guaranteed to
                      never render a dead/empty mailto link. */}
                  {outreach.structured.to && (
                    <a
                      href={`mailto:${outreach.structured.to}?subject=${encodeURIComponent(lang === "en" ? outreach.structured.subject_en : outreach.structured.subject_id)}&body=${encodeURIComponent(
                        lang === "en" ? outreach.structured.body_en : outreach.structured.body_id
                      )}`}
                      title={t("candidateDetail.outreach.openInEmailClient").replace("{email}", outreach.structured.to)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-forest-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-forest-700"
                    >
                      <Mail size={14} /> {t("candidateDetail.outreach.sendEmail")}
                    </a>
                  )}
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-100 p-4 font-mono text-[12.5px] leading-relaxed text-stone-700">{lang === "en" ? outreach.structured.body_en : outreach.structured.body_id}</pre>
              </div>
            )}
          </Panel>
        </div>
      )}
      </div>

      {/* Tracking status + source/registry badges (2026-08-31 — moved out of
          the main content column). This is administrative/reference
          metadata about the record itself, not pipeline-computed evidence
          about whether the candidate is worth pursuing — it belongs beside
          Key Gaps/Risks in the sidebar, not stacked inline with the
          hero/scores content it was previously sitting under. */}
      <div className="w-72 shrink-0 space-y-4">
        <KeyGapsSidebar rec={rec} onJump={(id) => jump(RAIL_SECTIONS.find((s) => s.id === id)!)} />
        <TrackingSummaryCard rec={rec} status={status} sources={sources} idBits={idBits} />
      </div>
      </div>

      {/* Invisible bottom spacer — see the bottomSpacerPx effect above.
          Real, measured dead space, never a guessed constant; 0px on any
          candidate/tab where every rail section already has enough real
          content below it to reach the top on its own. */}
      <div aria-hidden style={{ height: bottomSpacerPx }} />
    </div>
  );
}

/**
 * The page's real visual hero (2026-08-30 restructure — previously a
 * quiet monospace note below the title called "Suggested next step",
 * sitting beside two much louder score cards). Answers Gluri's own
 * stated Q&A framing directly: WHY this candidate should be contacted
 * first (score_label + compliance badge — the same calibrated signals
 * shown everywhere else in the app) and WHAT to propose in that first
 * outreach (dossier.suggested_poc, contact_route — the same real
 * generated text already shown on the Dossier tab's "Contact route" /
 * "Suggested point of contact" panels). No LLM call here, no invented
 * confidence percentage, no new sentence anywhere — every word and badge
 * on this panel traces to a real field already used elsewhere on this
 * exact page; only its size, position, and visual weight changed.
 *
 * The top why_gluri reason cards (2026-08-31, folded into this same
 * container) used to sit in their own separate white box directly below
 * this one — visually implying "recommendation" and "the facts behind
 * it" were two unrelated things, when they're one continuous argument.
 * Now both live inside ONE bordered/backgrounded container: the
 * recommendation stays visually prominent at the top, a subtle internal
 * divider marks where supporting evidence begins, and the reason cards
 * (still their own white sub-cards, for internal legibility) sit below
 * it — read top to bottom as a single argument, not two stacked panels.
 * Same real data as before (dossier.structured.why_gluri, sliced to the
 * top 3) — this is a container merge, not a content change.
 */
function WhyContactFirst({ scoring, dossier }: { scoring: CandidateDetail["scoring"]; dossier: CandidateDetail["dossier"] }) {
  const { t, lang } = useT();
  const topReasons = dossier.structured.why_gluri.slice(0, 3);
  return (
    // Instrument-panel shape (2026-08-31 visual-direction rollout) —
    // sharp corners, thinner hairline border (was border-2) instead of a
    // thick rounded one. The forest tint stays: this box is deliberately
    // THE one reserved accent on this page (same "one important element
    // per screen" principle as Dashboard's clay KPI card), not a
    // decorative color competing with anything else here.
    <div className="instrument-panel border border-forest-300 bg-forest-50 p-5">
      <div className="text-[11.5px] font-bold uppercase tracking-wide text-forest-700">{t("candidateDetail.hero.heading")}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        {/* ScoreLabelPill already has its own opt-in `lang` prop (see the
            component's own file) — passed through rather than
            re-translating its internals. ComplianceBadge has no such
            prop (see the report boundary note), so its Green/Amber/Red/
            N/A text stays English here, same as everywhere else in the app. */}
        <ScoreLabelPill label={scoring.score_label} need={scoring.need_score} cred={scoring.credibility_score} showNumbers={false} lang={lang} />
        <ComplianceBadge badge={scoring.compliance.badge} />
      </div>
      <p className="mt-3 font-display text-[19px] font-semibold leading-snug text-stone-900">{dossier.structured.suggested_poc}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-stone-700">{dossier.structured.contact_route}</p>

      {topReasons.length > 0 && (
        <div className="mt-4 border-t border-forest-200 pt-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {topReasons.map((r, i) => {
              const Icon = (r.evidence_level ?? "fact") === "fact" ? CheckCircle2 : Lightbulb;
              return (
                <div key={i} className="rounded-lg border border-forest-200/70 bg-white p-3">
                  <Icon size={16} className={(r.evidence_level ?? "fact") === "fact" ? "text-forest-600" : "text-clay-600"} />
                  <p className="mt-1.5 text-[12.5px] leading-snug text-stone-700">{r.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type KeyGap = { icon: LucideIcon; label: string; text: string; sectionId: string };

/**
 * Key Gaps / Risks (2026-08-31) — a persistent sidebar consolidating 4
 * real gap signals this page already computes and shows in full detail
 * elsewhere (DRAM/DPP from carbon_tracks, coordinate status from
 * land_rights/location, the compliance deadline, contact readiness from
 * outreach). Deliberately SHORT summary lines, not a second copy of the
 * full paragraphs those other sections already show — this panel's job
 * is "what's missing, at a glance, click through for detail," never a
 * duplicate. A gap only appears here when it genuinely applies (an
 * empty list renders an honest "no key gaps" line, not a blank panel) —
 * same "don't show a claim that doesn't apply" discipline as everywhere
 * else in this app.
 */
function KeyGapsSidebar({ rec, onJump }: { rec: CandidateDetail; onJump: (sectionId: string) => void }) {
  const { t } = useT();
  const { carbon_tracks, location, scoring, outreach, contact } = rec;
  const gaps: KeyGap[] = [];

  if (!carbon_tracks.dram && !carbon_tracks.dpp) {
    gaps.push({
      icon: FolderX,
      label: t("candidateDetail.gaps.missingRegDoc.label"),
      text: t("candidateDetail.gaps.missingRegDoc.text"),
      sectionId: "sec-dossier",
    });
  }
  if (location.latitude == null) {
    gaps.push({ icon: MapPin, label: t("candidateDetail.gaps.noCoordinates.label"), text: t("candidateDetail.gaps.noCoordinates.text"), sectionId: "sec-land-rights" });
  }
  if (scoring.compliance.badge === "amber" || scoring.compliance.badge === "red") {
    gaps.push({
      icon: CalendarClock,
      label: t("candidateDetail.gaps.complianceDeadline.label"),
      text: t("candidateDetail.gaps.complianceDeadline.text").replace("{n}", String(scoring.compliance.days_until_deadline)),
      sectionId: "sec-compliance",
    });
  }
  const recipientStatus = outreach?.structured.recipient_status;
  if (!outreach || recipientStatus === "insufficient_contact") {
    gaps.push({ icon: Mail, label: t("candidateDetail.gaps.contactReadiness.label"), text: t("candidateDetail.gaps.contactReadiness.none"), sectionId: "sec-outreach" });
  } else if (recipientStatus === "name_only_no_email") {
    // Distinguishes "never searched for an email" from "searched and found
    // nothing" (2026-08-31) — same wording pattern as ContactReadinessIndicator
    // and the Outreach warning; reuses this exact gap line, no new element.
    const text = contact?.contact_tier_b_attempted_at
      ? t("candidateDetail.gaps.contactReadiness.attempted")
      : t("candidateDetail.gaps.contactReadiness.notAttempted");
    gaps.push({ icon: Mail, label: t("candidateDetail.gaps.contactReadiness.label"), text, sectionId: "sec-outreach" });
  }

  return (
    <aside>
      <div className="instrument-panel sticky top-[92px] border border-stone-300 bg-white p-4">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-stone-800">
          <AlertTriangle size={15} className="text-compliance-amber" /> {t("candidateDetail.gaps.heading")}
        </div>
        {gaps.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-stone-500">{t("candidateDetail.gaps.none")}</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {gaps.map((g, i) => {
              const Icon = g.icon;
              return (
                <button
                  key={i}
                  onClick={() => onJump(g.sectionId)}
                  className="block w-full rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-left transition-colors hover:border-forest-300 hover:bg-forest-50/40"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon size={13} className="text-clay-600" />
                    <span className="text-[11.5px] font-semibold text-stone-700">{g.label}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-stone-600">{g.text}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Tracking status + source/registry badges (2026-08-31 — moved out of the
 * main content column into the sidebar, stacked below Key Gaps/Risks).
 * Real division of responsibility, same as before the move: this page
 * answers "is this candidate worth pursuing" — need, credibility,
 * evidence, land rights, contact, all real pipeline-computed data. "What
 * are we doing with them right now" (status/note/history — real,
 * user-owned, persisted data) belongs on the Tracked page, so a status
 * change can never be started here and finished there, or vice versa,
 * silently drifting apart. Same card visual language as Key Gaps/Risks
 * (white, bordered, rounded-xl) for a consistent sidebar column, not the
 * old inline stone-50 treatment that assumed a content-flow context.
 */
function TrackingSummaryCard({
  rec,
  status,
  sources,
  idBits,
}: {
  rec: CandidateDetail;
  status: CandidateDetail["status"];
  sources: string[];
  idBits: { label: string; plainLabel: string; value: string; url: string | null }[];
}) {
  const { t } = useT();
  return (
    <div className="instrument-panel border border-stone-300 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status.status} />
        <span className="text-[12px] text-stone-500">
          {status.status_changed_at ? t("candidateDetail.tracking.updated").replace("{date}", status.status_changed_at) : t("candidateDetail.tracking.noStatusChanges")}
        </span>
      </div>
      <Link to={`/tracked?candidate=${rec.candidate_id}`} className="mt-1.5 inline-block text-[12.5px] font-semibold text-forest-700 hover:underline">
        {t("candidateDetail.tracking.viewTracking")}
      </Link>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-3">
        {sources.map((s) => (
          <SourceBadge key={s} source={s} />
        ))}
      </div>
      {idBits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-stone-500">
          {idBits.map(({ label, plainLabel, value, url }) =>
            url ? (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("candidateDetail.tracking.viewOnRegistry").replace("{plainLabel}", plainLabel).replace("{label}", label)}
                className="inline-flex items-center gap-1"
              >
                {label} <code className="rounded bg-teal-50 px-1 py-0.5 text-teal-700 underline decoration-teal-300 underline-offset-2">{value} ↗</code>
              </a>
            ) : (
              <span key={label} title={plainLabel}>
                {label} <code className="rounded bg-stone-100 px-1 py-0.5 text-stone-700">{value}</code>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pure wayfinding, NOT a workflow/pipeline stepper — the same distinction
 * already made for the Dashboard (data_richness/scores are independent
 * facts recomputed each run, not stages a candidate progresses through
 * over time), applied here: these are the same section headings that
 * already exist on the page, nothing new is claimed by listing them, and
 * nothing here implies a candidate "moves through" Land Rights ->
 * Compliance -> Outreach in sequence. It's just a way to jump around an
 * admittedly dense page.
 *
 * Purely presentational (2026-08-31 refactor) — `activeId`/the actual
 * jump() logic now live in CandidateDetailPage itself, alongside `tab`,
 * so the top TABS bar and this rail share the EXACT SAME state and the
 * EXACT SAME click handler (see TAB_ENTRY_SECTION), instead of the rail
 * owning its own separate `activeId` that only the rail's own clicks
 * kept in sync. Tabs stay (their real job — reducing how much of this
 * dense page is mounted at once — is unchanged); this rail switches tabs
 * on the caller's behalf when a section lives in a different one, then
 * scrolls.
 */
function SectionRail({ visibleSections, activeId, onJump }: { visibleSections: RailSection[]; activeId: string; onJump: (s: RailSection) => void }) {
  const { t } = useT();
  return (
    <nav aria-label="Jump to section" className="sticky top-12 z-[5] -mx-6 mb-3 border-b border-stone-200 bg-white/95 px-6 backdrop-blur">
      <div className="flex flex-wrap gap-1 overflow-x-auto py-2 text-[12px]">
        {visibleSections.map((s) => (
          <button
            key={s.id}
            onClick={() => onJump(s)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold transition ${
              activeId === s.id ? "bg-forest-600 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>
    </nav>
  );
}

function documentIcon(url: string) {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0];
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return FileSpreadsheet;
  if (ext === "kml" || ext === "kmz" || ext === "geojson") return MapPinned;
  if (ext === "pdf" || ext === "docx" || ext === "doc") return FileText;
  return FileIcon;
}

function DocumentsPanel({ documents, expanded, onToggle }: { documents: DocumentRef[]; expanded: boolean; onToggle: () => void }) {
  const { t } = useT();
  const shown = expanded ? documents : documents.slice(0, DOCS_COLLAPSED_COUNT);
  return (
    <Panel id="sec-documents" title={t("candidateDetail.panel.documentsCount").replace("{n}", String(documents.length))} className="!p-4" variant="instrument">
      {/* Real evidence, never truncated out of existence — Katingan
          genuinely has 91 real, unique documents (VCS 1477's own
          multi-year monitoring/verification history). Collapsed to a
          manageable first page by default so one candidate's unusually
          rich record doesn't dominate the whole tab; every document is
          still one click away via "show all". */}
      <ul className="divide-y divide-stone-100">
        {shown.map((d, i) => {
          const Icon = documentIcon(d.url);
          return (
            <li key={i} className="flex items-center gap-3 py-1.5 text-[13px]">
              <Icon size={16} className="shrink-0 text-stone-400" />
              <span className="min-w-0 flex-1 truncate font-medium text-stone-700" title={d.title}>
                {d.title}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] uppercase text-stone-400">{d.source}</span>
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                title={t("candidateDetail.documents.viewDownloadTitle")}
                className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[12px] font-semibold text-teal-700 hover:bg-teal-50"
              >
                {t("candidateDetail.documents.view")} <ExternalLink size={12} />
              </a>
            </li>
          );
        })}
      </ul>
      {documents.length > DOCS_COLLAPSED_COUNT && (
        <button onClick={onToggle} className="mt-3 text-[12.5px] font-semibold text-forest-700 hover:text-forest-900">
          {expanded ? t("candidateDetail.documents.showFewer") : t("candidateDetail.documents.showAll").replace("{n}", String(documents.length))}
        </button>
      )}
    </Panel>
  );
}

// rule_id (e.g. "R016") kept as a prop purely for React's key/identity —
// deliberately not rendered: it's a raw internal rule identifier with no
// meaning to a user, and the real citation is already embedded in `reason`'s
// own prose (e.g. "...Pasal 10's precondition for trading carbon is met.").
function ComplianceRuleRow({ badge, reason, primary }: { rule_id: string; badge: CandidateDetail["scoring"]["compliance"]["badge"]; reason: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${primary ? "border-forest-200 bg-forest-50/40" : "border-stone-200"}`}>
      <div className="flex items-center gap-2">
        <ComplianceBadge badge={badge} />
      </div>
      <p className="mt-1.5 text-[13px] text-stone-700">{reason}</p>
    </div>
  );
}
