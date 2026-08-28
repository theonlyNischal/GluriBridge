import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import { fmtScore } from "../lib/format";
import type { CandidateListRow } from "../lib/types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

/**
 * Dashboard-scale map — same real tile layer, marker convention, and
 * GET /territories/{idx}/geometry endpoint already built and verified for
 * the Territory Discovery page and the candidate-detail TerritoryMap; NOT
 * a second map implementation. The one real difference from Territory
 * Discovery: instead of loading a polygon only when the user searches
 * for one territory, this auto-loads the real polygon for every
 * candidate that already has a confirmed BRWA overlap (a bounded, real,
 * small set — 11 of 144 real candidates, per brwa_idx on the list row —
 * not all 1,756 BRWA territories regardless of relevance, which was
 * explicitly flagged earlier this session as a separate, bigger, deferred
 * scope decision).
 */
export function DashboardMap({ candidates }: { candidates: CandidateListRow[] }) {
  const navigate = useNavigate();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // Tracks how many real BRWA polygons actually finished loading — distinct
  // from the number of candidates that merely claim an overlap, since a
  // fetch can 404 (the real ~23% BRWA-geometry gap confirmed elsewhere this
  // session). The legend must report what's actually on the map, not what
  // was merely attempted.
  const [loadedTerritoryCount, setLoadedTerritoryCount] = useState(0);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current).setView([-2.5, 118], 4.4);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: L.Layer[] = [];

    candidates.forEach((r) => {
      if (r.latitude == null || r.longitude == null) return;
      const color = r.data_richness === "thin" ? "#a05a2c" : "#2f6d4f";
      const marker = L.circleMarker([r.latitude, r.longitude], { radius: 5, color, fillColor: color, fillOpacity: 0.8, weight: 1 }).addTo(map);
      marker.bindPopup(
        `<strong>${escapeHtml(r.name)}</strong><br>${escapeHtml(r.org ?? "")}<br>` +
          `N ${fmtScore(r.need_score)} / C ${fmtScore(r.credibility_score)}<br>` +
          `<a href="#" data-candidate-id="${r.candidate_id}">View candidate &rarr;</a>`
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

    // Real BRWA polygons — one fetch per DISTINCT territory (a few
    // candidates can share the same real overlapping territory), fetched
    // lazily just like Territory Discovery, never a bulk dump.
    const uniqueIdx = [...new Set(candidates.filter((r) => r.brwa_idx).map((r) => r.brwa_idx as string))];
    const polygonLayers: L.Layer[] = [];
    let cancelled = false;
    Promise.all(
      uniqueIdx.map((idx) =>
        api
          .territoryGeometry(idx)
          .then((geojson) => {
            const layer = L.geoJSON(geojson, { style: { color: "#1c4140", weight: 1.5, fillOpacity: 0.15 } }).addTo(map);
            polygonLayers.push(layer);
          })
          .catch(() => {
            /* a real gap for ~23% of BRWA territories, confirmed elsewhere this session — skip silently here, same as the candidate-detail map's honest fallback. Not counted below, so the legend never overstates what's actually on the map. */
          })
      )
    ).then(() => {
      if (!cancelled) setLoadedTerritoryCount(polygonLayers.length);
    });

    return () => {
      cancelled = true;
      markers.forEach((m) => map.removeLayer(m));
      polygonLayers.forEach((l) => map.removeLayer(l));
    };
  }, [candidates, navigate]);

  return (
    <div>
      <div ref={elRef} className="h-[420px] rounded-lg border border-stone-200" />
      <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-stone-500">
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
          real BRWA territory ({loadedTerritoryCount} shown)
        </span>
      </div>
    </div>
  );
}
