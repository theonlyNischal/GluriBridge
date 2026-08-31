import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCandidates } from "../lib/CandidatesContext";
import { api } from "../lib/api";
import { fmtScore, POLICY_TIER_LABEL } from "../lib/format";
import { Panel } from "../components/ui/Panel";
import { FilterSelect } from "../components/ui/FilterSelect";
import { HonestState } from "../components/ui/HonestState";
import { SummaryLink } from "../components/ui/SummaryLink";
import { groupByProvince, PROVINCE_NOT_AVAILABLE, PROVINCE_MULTI_REGION } from "../lib/provinceNormalize";
import { applyCandidateFilter, filterParamsToSearchParams, searchParamsToFilterParams, type CandidateFilterParams } from "../lib/candidateFilter";
import type { CandidateListRow, StatsResponse, TerritoryListEntry } from "../lib/types";

/**
 * The whole-map Territory Discovery page — real candidate markers +
 * searchable/selectable real BRWA territory geometry. Rebuilt (2026-08-28)
 * on the same design system and shared filter/province-grouping libraries
 * as the Dashboard/Candidates/candidate-detail pages, replacing the
 * original max-w-6xl, KPI-less, alert()-on-error version. Distinct from
 * DashboardMap (dashboard-scale, no filtering, no search) and TerritoryMap
 * (single candidate + its own overlap) — this is the only page with a
 * candidate filter panel AND a searchable territory-name lookup together.
 */
export function TerritoryDiscoveryPage() {
  const { candidates } = useCandidates();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParams = searchParamsToFilterParams(searchParams);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const territoryLayerRef = useRef<L.GeoJSON | null>(null);
  const [geometryNotice, setGeometryNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => setStats(null));
  }, []);

  function updateFilter(patch: Partial<CandidateFilterParams>) {
    setSearchParams(filterParamsToSearchParams({ ...filterParams, ...patch }), { replace: true });
  }

  const filteredRows = useMemo(() => (candidates ? applyCandidateFilter(candidates, filterParams) : []), [candidates, searchParams.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map init. Deliberately depends on `candidates`, not `[]`: this
  // component (unlike DashboardMap, a separate child that only mounts
  // once its parent's data is ready) returns an early "Loading…" state
  // itself while `candidates` is still null, so the map div doesn't exist
  // in the DOM on the very first render. A `[]`-dep effect fires once,
  // right after that first commit, finds `mapElRef.current` null, and —
  // having no cleanup registered — never runs again once the real map div
  // appears on the next commit: a real bug caught via an empty map before
  // this comment existed. Re-running when `candidates` changes gives it a
  // second chance once the ref is actually attached; the guard below keeps
  // it a true no-op once the map already exists.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView([-2.5, 118], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [candidates]);

  // Real candidate markers, reactive to the filter panel — real lat/lon
  // from the API, never a fabricated position, and never more than what
  // the active filters actually select.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: L.CircleMarker[] = [];
    filteredRows.forEach((r) => {
      if (r.latitude == null || r.longitude == null) return;
      const color = r.data_richness === "thin" ? "#a05a2c" : "#2f6d4f";
      const marker = L.circleMarker([r.latitude, r.longitude], { radius: 5, color, fillColor: color, fillOpacity: 0.8, weight: 1 }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(r.name)}</strong><br>${escapeHtml(r.org ?? "")}<br>` +
          `N ${fmtScore(r.need_score)} / C ${fmtScore(r.credibility_score)}<br>` +
          `<a href="/candidates/${r.candidate_id}" data-candidate-id="${r.candidate_id}">View candidate &rarr;</a>`
      );
      markers.push(marker);
    });
    map.on("popupopen", (e) => {
      const el = (e as unknown as { popup: L.Popup }).popup.getElement();
      const link = el?.querySelector<HTMLAnchorElement>("a[data-candidate-id]");
      link?.addEventListener("click", (ev) => {
        ev.preventDefault();
        navigate(`/candidates/${link.dataset.candidateId}`);
      });
    });
    return () => {
      markers.forEach((m) => map.removeLayer(m));
    };
  }, [filteredRows, navigate]);

  // Shared by both the territory-name search panel and the confirmed-
  // overlap panel — one real geometry-loading path, one real honest
  // failure message (no native alert()), not two copies.
  async function loadTerritory(idx: string) {
    const map = mapRef.current;
    if (!map) return;
    try {
      const geojson = await api.territoryGeometry(idx);
      if (territoryLayerRef.current) map.removeLayer(territoryLayerRef.current);
      const layer = L.geoJSON(geojson, { style: { color: "#1c4140", weight: 2, fillOpacity: 0.25 } }).addTo(map);
      territoryLayerRef.current = layer;
      map.fitBounds(layer.getBounds());
      setGeometryNotice(null);
    } catch {
      setGeometryNotice("This territory has no real geometry on file — a confirmed real gap for ~23% of BRWA territories, not a bug.");
    }
  }

  if (!candidates) return <div className="px-6 py-6 text-stone-400">Loading…</div>;

  const total = candidates.length;
  const withOverlap = candidates.filter((r) => r.has_brwa_evidence).length;
  const mappableCount = filteredRows.filter((r) => r.latitude != null && r.longitude != null).length;
  const provinceGroups = groupByProvince(candidates);
  const namedProvinceCount = [...provinceGroups.keys()].filter((p) => p !== PROVINCE_NOT_AVAILABLE && p !== PROVINCE_MULTI_REGION).length;
  const notAvailableCount = provinceGroups.get(PROVINCE_NOT_AVAILABLE)?.length ?? 0;
  const brwaTotal = stats?.brwa_territories.total ?? null;
  const brwaWithGeometry = stats?.brwa_territories.with_geometry ?? null;

  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-stone-900">Territory Discovery</h1>
        <p className="mt-1 text-[13.5px] text-stone-500">Real candidate locations + real BRWA customary-territory geometry, fetched on demand</p>
      </div>

      {/* Executive summary — every number real, from either the already-
          loaded candidate list or the /stats endpoint's real BRWA totals
          (see backend/app/territories.py's count_stats()). */}
      <div className="mb-5 rounded-xl border border-stone-200 bg-white px-5 py-4">
        <p className="text-[14px] leading-relaxed text-stone-700">
          <SummaryLink to="/candidates">{total} real candidates</SummaryLink> are mapped here, spanning <strong>{namedProvinceCount}</strong> real
          provinces ({notAvailableCount} have no province on file).{" "}
          {brwaTotal != null ? (
            <>
              <strong>{brwaTotal.toLocaleString()}</strong> real BRWA customary territories are tracked, of which{" "}
              <strong>{brwaWithGeometry!.toLocaleString()}</strong> ({Math.round((brwaWithGeometry! / brwaTotal) * 100)}%) have geometry on file — a
              confirmed real ceiling for this data source, not an in-progress number.{" "}
            </>
          ) : (
            "Real BRWA territory totals are loading… "
          )}
          <SummaryLink to="/candidates?brwaOverlap=yes">{withOverlap}</SummaryLink> candidates have a confirmed land-rights overlap with a
          specific territory.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px,1fr]">
        <FilterPanel filterParams={filterParams} candidates={candidates} shownCount={filteredRows.length} onChange={updateFilter} />

        <div className="space-y-5">
          <div>
            <div ref={mapElRef} className="h-[520px] rounded-xl border border-stone-200" />
            <div className="mt-2 flex flex-wrap items-center gap-4 text-[12px] text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest-500" />
                rich candidate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-clay-600" />
                thin candidate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-800" />
                selected territory
              </span>
              <span className="text-stone-400">
                {filteredRows.length} of {total} shown
              </span>
            </div>
            {/* A filtered set can genuinely have zero plottable points —
                confirmed real, not a bug, e.g. every real Jawa Barat
                candidate on file lacks coordinates entirely. Surfaced
                explicitly so an empty-looking map reads as an honest
                data gap, not a broken filter. */}
            {filteredRows.length > 0 && mappableCount < filteredRows.length && (
              <div className="mt-2">
                <HonestState kind="no_data" label="Some candidates not shown on map" compact>
                  {filteredRows.length - mappableCount} of {filteredRows.length} filtered candidates have no real coordinates on file.
                </HonestState>
              </div>
            )}
            {geometryNotice && (
              <div className="mt-2">
                <HonestState kind="no_data" label="No geometry on file" compact>
                  {geometryNotice}
                </HonestState>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <SelectedRegionPanel province={filterParams.province} rows={filteredRows} />
            <SearchTerritoriesPanel onSelectTerritory={loadTerritory} />
            <ConfirmedOverlapPanel candidates={candidates} onSelectTerritory={loadTerritory} />
          </div>

          <TopTerritoriesList candidates={candidates} filterParams={filterParams} />
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  filterParams,
  candidates,
  shownCount,
  onChange,
}: {
  filterParams: CandidateFilterParams;
  candidates: CandidateListRow[];
  shownCount: number;
  onChange: (patch: Partial<CandidateFilterParams>) => void;
}) {
  const provinceOptions = useMemo(() => {
    const grouped = groupByProvince(candidates);
    const entries = [...grouped.entries()];
    // Real named provinces first, ranked by real count; the two honest
    // "we don't actually know the province" buckets are pinned at the end
    // regardless of count — "Not available" is usually the single
    // largest bucket (real province data is missing for a plurality of
    // candidates), and sorting purely by count would put it first, making
    // it look like the most common real province rather than a gap.
    const isSpecial = (label: string) => label === PROVINCE_NOT_AVAILABLE || label === PROVINCE_MULTI_REGION;
    const named = entries.filter(([label]) => !isSpecial(label)).sort((a, b) => b[1].length - a[1].length);
    const special = entries.filter(([label]) => isSpecial(label));
    return [...named, ...special].map(([label, rows]) => ({ value: label, label: `${label} (${rows.length})` }));
  }, [candidates]);

  const hasActiveFilter =
    filterParams.province || filterParams.richness || filterParams.brwaOverlap || filterParams.minNeed != null || filterParams.minCred != null;

  return (
    <Panel title="Filter candidates" className="h-fit lg:sticky lg:top-[68px]">
      <div className="space-y-3">
        <Field label="Province">
          <FilterSelect value={filterParams.province} onChange={(v) => onChange({ province: v })} placeholder="All provinces" options={provinceOptions} fullWidth />
        </Field>
        <Field label="Need score">
          <FilterSelect
            value={filterParams.minNeed != null ? String(filterParams.minNeed) : ""}
            onChange={(v) => onChange({ minNeed: v ? Number(v) : null })}
            placeholder="Any need score"
            options={[
              { value: "50", label: "≥ 50" },
              { value: "70", label: "≥ 70" },
              { value: "90", label: "≥ 90" },
            ]}
            fullWidth
          />
        </Field>
        <Field label="Credibility">
          <FilterSelect
            value={filterParams.minCred != null ? String(filterParams.minCred) : ""}
            onChange={(v) => onChange({ minCred: v ? Number(v) : null })}
            placeholder="Any credibility"
            options={[
              { value: "50", label: "≥ 50" },
              { value: "70", label: "≥ 70" },
              { value: "90", label: "≥ 90" },
            ]}
            fullWidth
          />
        </Field>
        <Field label="Richness">
          <FilterSelect
            value={filterParams.richness}
            onChange={(v) => onChange({ richness: v })}
            placeholder="All richness"
            options={[
              { value: "rich", label: "Rich" },
              { value: "corroborated", label: "Corroborated" },
              { value: "thin", label: "Thin" },
            ]}
            fullWidth
          />
        </Field>
        <Field label="Land rights / BRWA overlap">
          <FilterSelect
            value={filterParams.brwaOverlap}
            onChange={(v) => onChange({ brwaOverlap: v })}
            placeholder="Any overlap status"
            options={[
              { value: "yes", label: "Confirmed overlap" },
              { value: "no", label: "No confirmed overlap" },
            ]}
            fullWidth
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-[12px]">
        <span className="text-stone-500">
          {shownCount} of {candidates.length}
        </span>
        {hasActiveFilter && (
          <button onClick={() => onChange({ province: "", richness: "", brwaOverlap: "", minNeed: null, minCred: null })} className="font-medium text-forest-700 hover:underline">
            Reset
          </button>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</label>
      {children}
    </div>
  );
}

function SelectedRegionPanel({ province, rows }: { province: string; rows: CandidateListRow[] }) {
  if (!province) {
    return (
      <Panel title="Selected region">
        <HonestState kind="not_checked" label="No region selected">
          Pick a province in the filter panel to see real aggregate stats for candidates there.
        </HonestState>
      </Panel>
    );
  }
  if (rows.length === 0) {
    return (
      <Panel title={`Selected region — ${province}`}>
        <HonestState kind="no_data" label="No candidates match">No real candidates in {province} match the other active filters.</HonestState>
      </Panel>
    );
  }

  const richness = { rich: 0, corroborated: 0, thin: 0 };
  rows.forEach((r) => (richness[r.data_richness] = (richness[r.data_richness] ?? 0) + 1));
  const avgNeed = rows.reduce((s, r) => s + r.need_score, 0) / rows.length;
  const avgCred = rows.reduce((s, r) => s + r.credibility_score, 0) / rows.length;
  const top = [...rows].sort((a, b) => b.need_score - a.need_score)[0];

  return (
    <Panel title={`Selected region — ${province}`}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Candidates" value={String(rows.length)} />
        <Stat label="Rich / thin" value={`${richness.rich} / ${richness.thin}`} />
        <Stat label="Avg need" value={avgNeed.toFixed(1)} />
        <Stat label="Avg credibility" value={avgCred.toFixed(1)} />
      </div>
      {richness.corroborated > 0 && <p className="mt-2 text-[11px] text-stone-400">+{richness.corroborated} corroborated (real, not shown above)</p>}
      <div className="mt-3 border-t border-stone-100 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">Top opportunity (highest need_score here)</div>
        <Link to={`/candidates/${top.candidate_id}`} className="mt-1 block truncate text-[13px] font-medium text-forest-700 hover:underline" title={top.name}>
          {top.name} — need {fmtScore(top.need_score)}
        </Link>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2 text-center">
      <div className="font-mono text-[17px] font-semibold text-stone-800">{value}</div>
      <div className="text-[10.5px] uppercase tracking-wide text-stone-500">{label}</div>
    </div>
  );
}

// Shorter than POLICY_TIER_LABEL's full phrasing (2026-08-31) — this
// component's narrow one-line search row was still truncating with the
// full label ("In regulatory process" alone is longer than the whole row
// used to be), so this dense context gets its own compact wording; the
// full phrase remains one hover away via this row's own title attribute.
const COMPACT_POLICY_TIER_LABEL: Record<string, string> = {
  penetapan: "Decreed",
  pengaturan: "In process",
  belum_ada: "None yet",
};

function SearchTerritoriesPanel({ onSelectTerritory }: { onSelectTerritory: (idx: string) => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TerritoryListEntry[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!search || search.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .listTerritories(search, 20)
        .then((r) => {
          setResults(r);
          setSearchError(null);
        })
        .catch((e) => setSearchError(String(e.message ?? e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <Panel title="Search real BRWA territories">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Territory name…"
        className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] focus:border-forest-500 focus:outline-none"
      />
      <div className="mt-2.5 max-h-[220px] space-y-0.5 overflow-y-auto">
        {searchError && <p className="text-[12.5px] text-clay-700">Search failed: {searchError}</p>}
        {!searchError && search.trim().length < 2 && <p className="text-[12.5px] text-stone-400">Type at least 2 characters — searches real BRWA territory names.</p>}
        {!searchError && results && results.length === 0 && <p className="text-[12.5px] text-stone-400">No real BRWA territory matches "{search}".</p>}
        {results?.map((t) => (
          <button key={t.idx} onClick={() => onSelectTerritory(t.idx)} className="block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-forest-50">
            <div className="truncate font-medium text-stone-800">{t.name}</div>
            <div
              className="truncate text-[11.5px] text-stone-400"
              title={`${t.province ?? "no province on file"} · ${POLICY_TIER_LABEL[t.policy_tier] ?? t.policy_tier} · ${t.has_geometry ? "boundary shape on file" : "no boundary shape on file"}`}
            >
              {t.province ?? "—"} · {COMPACT_POLICY_TIER_LABEL[t.policy_tier] ?? t.policy_tier} · {t.has_geometry ? "on file" : "no boundary"}
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function ConfirmedOverlapPanel({ candidates, onSelectTerritory }: { candidates: CandidateListRow[]; onSelectTerritory: (idx: string) => Promise<void> }) {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const grouped = useMemo(() => {
    const m = new Map<string, CandidateListRow[]>();
    candidates.forEach((r) => {
      if (!r.brwa_idx) return;
      const arr = m.get(r.brwa_idx) ?? [];
      arr.push(r);
      m.set(r.brwa_idx, arr);
    });
    return m;
  }, [candidates]);

  useEffect(() => {
    const missing = [...grouped.keys()].filter((idx) => !names.has(idx));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((idx) => api.getTerritory(idx).then((t) => [idx, t.name] as const).catch(() => [idx, `Territory ${idx}`] as const))).then((pairs) => {
      if (cancelled) return;
      setNames((prev) => {
        const next = new Map(prev);
        pairs.forEach(([idx, name]) => next.set(idx, name));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped]);

  const ranked = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  const withOverlap = candidates.filter((r) => r.has_brwa_evidence).length;

  return (
    <Panel title="Territories with confirmed candidate overlap">
      <p className="mb-2 text-[11px] text-stone-400">
        Real, confirmed land-rights checks only ({withOverlap} of {candidates.length} candidates) — a territory absent here hasn't necessarily
        been checked against every candidate, per gluribridge/README.md's Open Items.
      </p>
      {ranked.length === 0 ? (
        <HonestState kind="no_data" label="No confirmed overlaps in the current data" />
      ) : (
        <ol className="space-y-1">
          {ranked.map(([idx, rows]) => (
            <li key={idx}>
              <button onClick={() => onSelectTerritory(idx)} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-forest-50">
                <span className="truncate font-medium text-stone-700">{names.get(idx) ?? `Loading… (${idx})`}</span>
                <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 font-mono text-[11px] text-teal-800">{rows.length}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function TopTerritoriesList({ candidates, filterParams }: { candidates: CandidateListRow[]; filterParams: CandidateFilterParams }) {
  const rowsForRanking = useMemo(() => applyCandidateFilter(candidates, { ...filterParams, province: "" }), [candidates, filterParams]);
  const grouped = groupByProvince(rowsForRanking);
  // "Not available" / "Spans multiple provinces" are real, honest buckets
  // in the filter and the Dashboard's breakdown — but this panel's purpose
  // is real geographic concentration, and "Not available" is usually the
  // single largest bucket (most candidates lack a province), which would
  // otherwise misleadingly rank #1 as a "top territory." Excluded here,
  // not hidden — the count is surfaced in the caption below instead.
  const excluded = (rowsForRanking.length - [...grouped.entries()].filter(([label]) => label !== PROVINCE_NOT_AVAILABLE && label !== PROVINCE_MULTI_REGION).reduce((s, [, rows]) => s + rows.length, 0));
  const ranked = [...grouped.entries()]
    .filter(([label]) => label !== PROVINCE_NOT_AVAILABLE && label !== PROVINCE_MULTI_REGION)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  const maxCount = Math.max(...ranked.map(([, rows]) => rows.length), 1);

  return (
    <Panel title="Top territories — real candidate count by province">
      <p className="mb-3 text-[11.5px] text-stone-400">
        Ranked by real candidate count, not average need score — a province with a single high-need candidate would otherwise misleadingly
        outrank one with genuine breadth. Reflects the other active filters (not the Province filter itself); click a row for its exact filtered
        Candidates view. {excluded > 0 && `${excluded} candidates with no province on file (or spanning multiple provinces) are excluded from this geographic ranking — use the Province filter to view them directly.`}
      </p>
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
        {ranked.map(([province, rows]) => {
          const linkParams = filterParamsToSearchParams({ ...filterParams, province });
          return (
            <Link key={province} to={`/candidates?${linkParams.toString()}`} className="flex items-center gap-3 rounded px-1 py-1 text-[12.5px] hover:bg-forest-50">
              <span className="w-36 shrink-0 truncate text-stone-700" title={province}>
                {province}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full rounded-full bg-teal-700" style={{ width: `${(rows.length / maxCount) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-stone-500">{rows.length}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
