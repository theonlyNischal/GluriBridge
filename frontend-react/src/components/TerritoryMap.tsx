import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import type { BRWAOverlap } from "../lib/types";
import { HonestState } from "./ui/HonestState";

/**
 * Candidate-detail-page territory map, ported directly from the verified
 * vanilla-JS implementation (frontend/app.js's initCandidateTerritoryMap)
 * — same two layers, same honest-disclosure behavior for every real state:
 * LAYER 2 (candidate point) renders whenever real coordinates exist,
 * independent of overlap. LAYER 1 (real BRWA polygon) overlays on top when
 * brwa_overlap exists. No coordinate -> the shared HonestState component,
 * distinguishing "never had one" from "had one, flagged as implausible"
 * (geoFlaggedReason) — never a blank or broken map area either way.
 */
export function TerritoryMap({
  latitude,
  longitude,
  geoFlaggedReason,
  brwaOverlap,
}: {
  latitude: number | null;
  longitude: number | null;
  geoFlaggedReason: string | null;
  brwaOverlap: BRWAOverlap | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const [geometryNote, setGeometryNote] = useState<string | null>(null);

  useEffect(() => {
    if (!elRef.current || latitude == null || longitude == null) return;
    const point: [number, number] = [latitude, longitude];
    const map = L.map(elRef.current).setView(point, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    const marker = L.circleMarker(point, { radius: 7, color: "#2f6d4f", fillColor: "#2f6d4f", fillOpacity: 0.9, weight: 2 }).addTo(map);
    marker.bindTooltip("Candidate location (real coordinates)");

    let cancelled = false;
    if (brwaOverlap?.brwa_idx) {
      api
        .territoryGeometry(brwaOverlap.brwa_idx)
        .then((geojson) => {
          if (cancelled) return;
          const layer = L.geoJSON(geojson, { style: { color: "#1c4140", weight: 2, fillOpacity: 0.2 } }).addTo(map);
          const bounds = layer.getBounds().extend(point);
          map.fitBounds(bounds, { padding: [20, 20] });
        })
        .catch(() => {
          if (!cancelled) {
            setGeometryNote(`No real polygon geometry on file for ${brwaOverlap.territory_name} — the point above is still real, just without a boundary overlay.`);
          }
        });
    }
    return () => {
      cancelled = true;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, brwaOverlap?.brwa_idx]);

  if (latitude == null || longitude == null) {
    if (geoFlaggedReason) {
      return <HonestState kind="not_trusted" label="Coordinate on file but not trusted" compact title={geoFlaggedReason} />;
    }
    return <HonestState kind="no_data" label="No location data on file for this candidate" />;
  }

  return (
    <div>
      <div ref={elRef} className="h-[280px] rounded-lg border border-stone-200" />
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest-500" />
          candidate location
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-800" />
          BRWA territory boundary
        </span>
      </div>
      {geometryNote && <p className="mt-1 text-[11.5px] text-stone-500">{geometryNote}</p>}
    </div>
  );
}
