import { useState } from "react";
import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { LayoutGrid, MapPin, Table2, ListChecks, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { CandidatesProvider } from "./lib/CandidatesContext";
import { LanguageProvider } from "./lib/LanguageContext";
import { useT, type StringKey } from "./lib/i18n";
import { LanguageToggle } from "./components/ui/LanguageToggle";
import logoWhite from "./assets/gluribridge-logo-white.png";
import { LandingPage } from "./pages/LandingPage";
import { DesignSystemPage } from "./pages/DesignSystemPage";
import { CandidateDetailPage } from "./pages/CandidateDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CandidatesListPage } from "./pages/CandidatesListPage";
import { TerritoryDiscoveryPage } from "./pages/TerritoryDiscoveryPage";
import { TrackedPage } from "./pages/TrackedPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { SyncPage } from "./pages/SyncPage";

// Labels below are translation KEYS, not literal text (2026-09-03, EN/KO
// toggle) — resolved via useT()'s t() at render time so this nav/header
// chrome flips with the rest of the app regardless of which page is
// showing. Every other page's own content stays English-only; see
// LanguageContext.tsx for the full scope reasoning.
const NAV: { to: string; labelKey: StringKey; end?: boolean; icon: typeof LayoutGrid }[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", end: true, icon: LayoutGrid },
  { to: "/territories", labelKey: "nav.territoryDiscovery", icon: MapPin },
  { to: "/candidates", labelKey: "nav.candidates", icon: Table2 },
  { to: "/tracked", labelKey: "nav.partnerships", icon: ListChecks },
  { to: "/sync", labelKey: "nav.sync", icon: RefreshCw },
];

const TITLE_KEYS: Record<string, StringKey> = {
  "/dashboard": "nav.dashboard",
  "/territories": "nav.territoryDiscovery",
  "/candidates": "nav.candidates",
  "/tracked": "nav.partnerships",
  "/sync": "nav.sync",
  "/design-system": "nav.designSystem",
  "/how-it-works": "nav.howItWorks",
};

function pageTitle(pathname: string, t: (key: StringKey) => string): string {
  if (TITLE_KEYS[pathname]) return t(TITLE_KEYS[pathname]);
  if (pathname.startsWith("/candidates/")) return t("title.candidateDetail");
  return "GluriBridge";
}


function AppShell() {
  const location = useLocation();
  const { t } = useT();
  // Sidebar collapse (2026-08-31 visual polish) — plain component state,
  // not persisted: this is a within-session convenience toggle, not a
  // standing preference worth surviving a reload (no real request for
  // that either). Collapsed shows icon-only nav with a native `title`
  // tooltip per item, standing in for the now-hidden label text.
  const [collapsed, setCollapsed] = useState(false);
  const sidebarWidth = collapsed ? "w-16" : "w-60";
  const contentOffset = collapsed ? "ml-16" : "ml-60";

  return (
    <>
      {/* Sidebar — fixed, never scrolls away, regardless of page content height. */}
      <aside className={`fixed inset-y-0 left-0 z-20 flex ${sidebarWidth} flex-col bg-forest-950 text-stone-200 transition-[width]`}>
        {/* Brand mark links back to the landing page (2026-09-03, added
            alongside it) — standard "click the logo to go home" pattern;
            wasn't a link to anywhere before the landing page existed.
            Real logo (2026-09-03) — white-ink variant specifically for
            this dark forest-950 sidebar; the green-ink original (same
            source, see LandingPage.tsx) has weak contrast here. */}
        <Link to="/" className={`flex items-center gap-2 px-5 py-4 ${collapsed ? "justify-center px-0" : ""}`}>
          {/* alt (not alt="") on purpose — when collapsed, the icon is
              the ONLY visible identifier (no adjacent text), so it needs
              a real accessible name, not a decorative empty one. */}
          <img src={logoWhite} alt="GluriBridge" className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="font-display text-[15px] font-semibold text-white">GluriBridge</span>}
        </Link>
        <nav className="mt-1 flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${collapsed ? "justify-center px-2" : ""} ${
                    isActive ? "bg-forest-800 text-white" : "text-stone-300 hover:bg-forest-900 hover:text-white"
                  }`
                }
              >
                <Icon size={15} strokeWidth={2} />
                {!collapsed && label}
              </NavLink>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-stone-500">
            {t("nav.tagline1")}
            <br />
            {t("nav.tagline2")}
            <div className="mt-2 flex flex-col gap-1">
              <NavLink to="/how-it-works" className="text-stone-500 underline decoration-stone-700 underline-offset-2 hover:text-stone-300">
                {t("nav.howItWorks")}
              </NavLink>
              <NavLink to="/design-system" className="text-stone-500 underline decoration-stone-700 underline-offset-2 hover:text-stone-300">
                {t("nav.designSystem")}
              </NavLink>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          className={`flex items-center gap-2 border-t border-forest-900 px-5 py-3 text-[12px] font-medium text-stone-400 hover:bg-forest-900 hover:text-white ${
            collapsed ? "mt-auto justify-center px-2" : ""
          }`}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && t("nav.collapse")}
        </button>
      </aside>

      {/* Content column — offset by the sidebar's fixed width, scrolls independently. */}
      <div className={`${contentOffset} flex min-h-screen flex-col bg-stone-50 transition-[margin]`}>
        {/* Top bar — full-width chrome belonging to the shell, not page content.
            No search box here: it was a decorative control with no
            onChange/filter logic wired to it — a real, working search
            already exists on the Candidates page itself; duplicating it
            here as a second, non-functional one is worse than not having
            one, so it's gone rather than faked into working. */}
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-4 border-b border-stone-200 bg-white px-5">
          <h1 className="text-[14px] font-semibold text-stone-800">{pageTitle(location.pathname, t)}</h1>
          <LanguageToggle className="ml-auto" />
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/candidates" element={<CandidatesListPage />} />
            <Route path="/tracked" element={<TrackedPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/candidates/:id" element={<CandidateDetailPage />} />
            <Route path="/territories" element={<TerritoryDiscoveryPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
          </Routes>
        </main>
      </div>
    </>
  );
}

// Route split (2026-09-03) — "/" is now a standalone cold-open landing
// page with NO sidebar/header chrome (a deliberate front door, not just
// another app view); every other real route lives under AppShell as
// before, unchanged. CandidatesProvider now wraps BOTH — moved up from
// inside AppShell — so the landing page's live proof-point numbers and
// the rest of the app share the exact one real fetch, never a second
// independent request for the same data.
export default function App() {
  return (
    <LanguageProvider>
      <CandidatesProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </CandidatesProvider>
    </LanguageProvider>
  );
}
