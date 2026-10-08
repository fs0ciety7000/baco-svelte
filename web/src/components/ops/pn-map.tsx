"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

import type { LevelCrossing } from "@/server/data/ops";

const ZONE_COLOR: Record<string, string> = {
  FTY: "var(--info)",
  FMS: "var(--accent)",
  FCR: "var(--danger)",
  FNR: "var(--ok)",
};

/**
 * Carte des PN (Leaflet, chargé à la demande) : fond raster relayé par le serveur CSM (/api/operations/tuiles),
 * points dessinés en canvas, aucune popup HTML (la fiche s'ouvre dans le panneau, rendue par React).
 */
export function PnMap({
  crossings,
  selected,
  onSelect,
}: {
  crossings: LevelCrossing[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const [tilesDown, setTilesDown] = useState(false);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const lf =
        (mod as unknown as { default?: typeof Leaflet }).default ??
        (mod as unknown as typeof Leaflet);
      L.current = lf;
      const m = lf
        .map(el.current, {
          preferCanvas: true,
          zoomControl: true,
          attributionControl: true,
          minZoom: 7,
          maxZoom: 18,
        })
        .setView([50.5, 3.95], 9);
      m.attributionControl.setPrefix(false);
      let errors = 0;
      lf.tileLayer("/api/operations/tuiles/{z}/{x}/{y}", {
        minZoom: 7,
        maxZoom: 18,
        attribution: "© contributeurs OpenStreetMap",
      })
        .on("tileerror", () => {
          errors++;
          if (errors > 6) setTilesDown(true);
        })
        .on("tileload", () => setTilesDown(false))
        .addTo(m);
      layer.current = lf.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
      // Taille du conteneur connue après la mise en page (onglet mobile, panneau).
      setTimeout(() => m.invalidateSize(), 50);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Points : redessinés quand la liste filtrée ou la sélection change.
  useEffect(() => {
    const lf = L.current;
    const group = layer.current;
    if (!lf || !group || !map.current) return;
    group.clearLayers();
    const css = getComputedStyle(document.documentElement);
    const color = (zone: string) => {
      const v = ZONE_COLOR[zone] ?? "var(--fg-muted)";
      const name = v.slice(4, -1);
      return css.getPropertyValue(name).trim() || "#888";
    };
    // Texte du survol posé en textContent (jamais de chaîne HTML dans Leaflet).
    const tip = (text: string) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    };
    const pts: [number, number][] = [];
    for (const c of crossings) {
      if (!c.lat || !c.lon) continue;
      pts.push([c.lat, c.lon]);
      const isSel = c.id === selected;
      lf.circleMarker([c.lat, c.lon], {
        radius: isSel ? 9 : 6,
        color: isSel ? css.getPropertyValue("--fg").trim() || "#000" : color(c.zone),
        weight: isSel ? 3 : 1.5,
        fillColor: color(c.zone),
        fillOpacity: 0.85,
      })
        .bindTooltip(tip(`PN ${c.number} · ${c.line}`), { direction: "top" })
        .on("click", () => onSelectRef.current(c.id))
        .addTo(group);
    }
    const sel = crossings.find((c) => c.id === selected && c.lat);
    if (sel) map.current.setView([sel.lat, sel.lon], Math.max(map.current.getZoom(), 14));
    else if (pts.length)
      map.current.fitBounds(lf.latLngBounds(pts), { padding: [24, 24], maxZoom: 14 });
  }, [crossings, selected, ready]);

  return (
    <div className="relative h-full min-h-80 w-full border border-border">
      <div
        ref={el}
        className="pn-map absolute inset-0"
        role="region"
        aria-label="Carte des passages à niveau"
        data-testid="pn-map"
      />
      {tilesDown ? (
        <p
          role="status"
          className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 border border-warn/50 bg-surface px-3 py-1 text-small"
        >
          Fond de carte indisponible : la liste et les liens restent utilisables.
        </p>
      ) : null}
    </div>
  );
}
