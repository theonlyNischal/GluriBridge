import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { LayoutGrid, MapPin, Table2, ListChecks } from "lucide-react";
import { CandidatesProvider } from "./lib/CandidatesContext";
import { StalenessBanner } from "./components/StalenessBanner";
import { DesignSystemPage } from "./pages/DesignSystemPage";
import { CandidateDetailPage } from "./pages/CandidateDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CandidatesListPage } from "./pages/CandidatesListPage";
import { TerritoryDiscoveryPage } from "./pages/TerritoryDiscoveryPage";
import { TrackedPage } from "./pages/TrackedPage";

const NAV = [
  { to: "/", label: "Dashboard", end: true, icon: LayoutGrid },
  { to: "/territories", label: "Territory Discovery", icon: MapPin },
  { to: "/candidates", label: "Candidates", icon: Table2 },
  { to: "/tracked", label: "Partnerships", icon: ListChecks },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/territories": "Territory Discovery",
  "/candidates": "Candidates",
  // Sidebar label and page title only, per explicit scope — the route
  // path (/tracked), the page's own internal wording ("Tracked total",
  // "View tracking →"), and the component/file name are deliberately
  // untouched here (not asked for; flagged separately, not silently
  // changed too).
  "/tracked": "Partnerships",
  "/design-system": "Design system",
};

function pageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith("/candidates/")) return "Candidate detail";
  return "GluriBridge";
}

export default function App() {
  const location = useLocation();

  return (
    <CandidatesProvider>
      {/* Sidebar — fixed, never scrolls away, regardless of page content height. */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-forest-950 text-stone-200">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="h-2 w-2 rounded-full bg-forest-400" />
          <span className="font-display text-[15px] font-semibold text-white">GluriBridge</span>
        </div>
        <nav className="mt-1 flex flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                    isActive ? "bg-forest-800 text-white" : "text-stone-300 hover:bg-forest-900 hover:text-white"
                  }`
                }
              >
                <Icon size={15} strokeWidth={2} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-stone-500">
          Indonesia forestry-carbon
          <br />
          partner discovery
          <div className="mt-2">
            <NavLink to="/design-system" className="text-stone-500 underline decoration-stone-700 underline-offset-2 hover:text-stone-300">
              Design system
            </NavLink>
          </div>
        </div>
      </aside>

      {/* Content column — offset by the sidebar's fixed width, scrolls independently. */}
      <div className="ml-60 flex min-h-screen flex-col bg-stone-50">
        {/* Top bar — full-width chrome belonging to the shell, not page content.
            No search box here: it was a decorative control with no
            onChange/filter logic wired to it — a real, working search
            already exists on the Candidates page itself; duplicating it
            here as a second, non-functional one is worse than not having
            one, so it's gone rather than faked into working. */}
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-4 border-b border-stone-200 bg-white px-5">
          <h1 className="text-[14px] font-semibold text-stone-800">{pageTitle(location.pathname)}</h1>
        </header>
        <StalenessBanner />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/candidates" element={<CandidatesListPage />} />
            <Route path="/tracked" element={<TrackedPage />} />
            <Route path="/candidates/:id" element={<CandidateDetailPage />} />
            <Route path="/territories" element={<TerritoryDiscoveryPage />} />
            <Route path="/design-system" element={<DesignSystemPage />} />
          </Routes>
        </main>
      </div>
    </CandidatesProvider>
  );
}
