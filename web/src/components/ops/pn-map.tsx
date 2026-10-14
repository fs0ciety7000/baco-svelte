"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

import { clusterPoints } from "@/lib/network/pn";
import type { ZoneShapes } from "@/lib/network/voronoi";

export type MapZone = { code: string; name: string; color: string; polygon?: unknown };
export type MapPoint = { id: string; lat: number; lon: number; zone: string; label: string };

/** Anneaux [lat, lon] d'un GeoJSON Polygon / MultiPolygon posé à la main (autre forme : ignorée). */
function geoJsonRings(g: unknown): [number, number][][] {
  const o = g as { type?: string; coordinates?: unknown } | null;
  const ring = (r: unknown) =>
    Array.isArray(r)
      ? r
          .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
          .map(([lon, lat]) => [lat, lon] as [number, number])
      : [];
  if (o?.type === "Polygon" && Array.isArray(o.coordinates))
    return o.coordinates.slice(0, 1).map(ring);
  if (o?.type === "MultiPolygon" && Array.isArray(o.coordinates))
    return o.coordinates.flatMap((p) => (Array.isArray(p) ? p.slice(0, 1).map(ring) : []));
  return [];
}

/**
 * Carte réseau (Leaflet, chargé à la demande) : fond raster relayé par le serveur CSM (/api/operations/tuiles), PN en
 * canvas (couleur de leur zone SPI), regroupés à faible zoom ; couche « Zones SPI » facultative (cellules par zone,
 * frontières, codes). Aucune chaîne HTML dans Leaflet : textes posés en `textContent`. La fiche s'ouvre dans le panneau
 * React. Survol : `hovered` (liste → carte) et `onHover` (carte → liste).
 */
export function PnMap({
  points,
  selected,
  hovered,
  onSelect,
  onHover,
  zones,
  showZones,
  fitKey,
  ariaLabel = "Carte des passages à niveau",
  testId = "pn-map",
}: {
  points: MapPoint[];
  selected: string | null;
  hovered?: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  zones: MapZone[];
  showZones: boolean;
  /** Change quand les filtres changent : la carte se recadre sur les points (jamais sur une simple sélection). */
  fitKey: string;
  ariaLabel?: string;
  testId?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const zoneLayer = useRef<Leaflet.LayerGroup | null>(null);
  const refs = useRef(new Map<string, Leaflet.CircleMarker>());
  const L = useRef<typeof Leaflet | null>(null);
  const shapes = useRef<ZoneShapes | null>(null);
  const [tilesDown, setTilesDown] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(8);
  const [sized, setSized] = useState(0);
  const moved = useRef(false);
  const [shapesState, setShapesState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const cb = useRef({ onSelect, onHover });
  cb.current = { onSelect, onHover };
  const lastFit = useRef<string | null>(null);

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
        .setView([50.55, 4.4], 8);
      m.attributionControl.setPrefix(false);
      m.createPane("zones").style.zIndex = "350";
      // Codes des zones au-dessus des PN (petits, sans clic).
      const labels = m.createPane("zoneLabels");
      labels.style.zIndex = "640";
      labels.style.pointerEvents = "none";
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
      zoneLayer.current = lf.layerGroup().addTo(m);
      markers.current = lf.layerGroup().addTo(m);
      m.on("zoomend", () => setZoom(m.getZoom()));
      map.current = m;
      setReady(true);
      // Taille du conteneur connue après la mise en page (onglet mobile, panneau ancré).
      setTimeout(() => m.invalidateSize(), 50);
      // Conteneur redimensionné (onglet mobile, panneau ancré) : recadrage tant que l'agent n'a pas déplacé la carte.
      m.on("dragstart", () => (moved.current = true));
      const touched = () => (moved.current = true);
      el.current.addEventListener("wheel", touched, { passive: true });
      el.current.addEventListener("touchstart", touched, { passive: true });
      m.getContainer()
        .querySelector(".leaflet-control-zoom")
        ?.addEventListener("click", touched);
      const ro = new ResizeObserver(() => {
        m.invalidateSize();
        if (!moved.current) {
          lastFit.current = null;
          setSized((n) => n + 1);
        }
      });
      ro.observe(el.current);
      m.once("unload", () => ro.disconnect());
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const css = () => getComputedStyle(document.documentElement);
  const colorOf = (zone: string) =>
    zones.find((z) => z.code === zone)?.color ||
    css().getPropertyValue("--fg-muted").trim() ||
    "#888";

  // PN : redessinés quand la liste, le zoom, la sélection ou les couleurs changent.
  useEffect(() => {
    const lf = L.current;
    const group = markers.current;
    const m = map.current;
    if (!lf || !group || !m) return;
    group.clearLayers();
    refs.current.clear();
    const fg = css().getPropertyValue("--fg").trim() || "#000";
    const tip = (text: string) => {
      const span = document.createElement("span");
      span.textContent = text;
      return span;
    };
    const placed = points.filter((p) => p.lat && p.lon);
    for (const c of clusterPoints(placed, zoom, { keep: selected })) {
      if (c.kind === "cluster") {
        const node = document.createElement("span");
        node.className = "pn-cluster";
        node.textContent = String(c.count);
        const size = c.count >= 100 ? 44 : c.count >= 20 ? 38 : 32;
        lf.marker([c.lat, c.lon], {
          icon: lf.divIcon({ html: node, className: "", iconSize: [size, size] }),
          keyboard: false,
          title: `${c.count} passages à niveau`,
        })
          .on("click", () =>
            m.flyToBounds(lf.latLngBounds(c.items.map((p) => [p.lat, p.lon])), {
              padding: [40, 40],
              maxZoom: 15,
              duration: 0.4,
            }),
          )
          .addTo(group);
        continue;
      }
      const p = c.item;
      const isSel = p.id === selected;
      const mk = lf
        .circleMarker([p.lat, p.lon], {
          radius: isSel ? 9 : 6,
          color: isSel ? fg : colorOf(p.zone),
          weight: isSel ? 3 : 1.5,
          fillColor: colorOf(p.zone),
          fillOpacity: 0.9,
        })
        .bindTooltip(tip(p.label), { direction: "top" })
        .on("click", () => cb.current.onSelect(p.id))
        .on("mouseover", () => cb.current.onHover?.(p.id))
        .on("mouseout", () => cb.current.onHover?.(null))
        .addTo(group);
      refs.current.set(p.id, mk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, selected, zoom, ready, zones]);

  // Survol depuis la liste : seul le marqueur concerné change de style (pas de redessin complet).
  useEffect(() => {
    const mk = hovered ? refs.current.get(hovered) : undefined;
    if (!mk || hovered === selected) return;
    const fg = css().getPropertyValue("--fg").trim() || "#000";
    mk.setRadius(9);
    mk.setStyle({ color: fg, weight: 2.5 });
    mk.bringToFront();
    return () => {
      const z = points.find((p) => p.id === hovered)?.zone ?? "";
      mk.setRadius(6);
      mk.setStyle({ color: colorOf(z), weight: 1.5 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, selected, points]);

  // Recadrage : sur les points quand les filtres changent, sur le PN sélectionné sinon.
  useEffect(() => {
    const lf = L.current;
    const m = map.current;
    if (!lf || !m) return;
    const sel = points.find((p) => p.id === selected && p.lat);
    if (sel) {
      m.setView([sel.lat, sel.lon], Math.max(m.getZoom(), 14), { animate: true });
      lastFit.current = fitKey;
      return;
    }
    if (lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    const pts = points.filter((p) => p.lat).map((p) => [p.lat, p.lon] as [number, number]);
    if (pts.length) m.fitBounds(lf.latLngBounds(pts), { padding: [32, 32], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, selected, ready, sized]);

  // Couche « Zones SPI » : chargée à la première demande, dessinée sous les PN.
  useEffect(() => {
    if (!showZones || shapes.current || shapesState === "loading") return;
    setShapesState("loading");
    fetch("/api/reseau/zones-spi", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ZoneShapes>) : Promise.reject(new Error())))
      .then((s) => {
        shapes.current = s;
        setShapesState("ok");
      })
      .catch(() => setShapesState("error"));
  }, [showZones, shapesState]);

  useEffect(() => {
    const lf = L.current;
    const group = zoneLayer.current;
    if (!lf || !group) return;
    group.clearLayers();
    const s = shapes.current;
    if (!showZones || !s) return;
    const renderer = lf.canvas({ pane: "zones" });
    const muted = css().getPropertyValue("--fg-muted").trim() || "#666";
    const manual = new Set<string>();
    for (const z of zones) {
      const rings = geoJsonRings(z.polygon);
      if (!rings.length) continue;
      manual.add(z.code);
      lf.polygon(rings, {
        renderer,
        color: z.color,
        weight: 2,
        fillColor: z.color,
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(group);
    }
    for (const [code, cells] of Object.entries(s.cells)) {
      if (manual.has(code)) continue;
      const color = colorOf(code);
      lf.polygon(cells, {
        renderer,
        stroke: false,
        fillColor: color,
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(group);
    }
    for (const b of s.borders) {
      if (manual.has(b.zones[0]) || manual.has(b.zones[1])) continue;
      lf.polyline(b.path, {
        renderer,
        color: muted,
        weight: 1.4,
        opacity: 0.9,
        dashArray: "5 4",
        interactive: false,
      }).addTo(group);
    }
    // Codes des zones à partir du zoom 8 (en dessous, ils se chevauchent).
    for (const [code, at] of zoom >= 8 ? Object.entries(s.labels) : []) {
      const node = document.createElement("span");
      node.className = "pn-zone-label";
      node.textContent = code;
      node.style.setProperty("--zone", colorOf(code));
      lf.marker(at, {
        icon: lf.divIcon({ html: node, className: "", iconSize: [48, 22] }),
        interactive: false,
        keyboard: false,
        pane: "zoneLabels",
      }).addTo(group);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZones, shapesState, ready, zones, zoom >= 8]);

  return (
    <div className="relative h-full min-h-80 w-full overflow-hidden rounded-box border border-border">
      <div
        ref={el}
        className="pn-map absolute inset-0"
        role="region"
        aria-label={ariaLabel}
        data-testid={testId}
      />
      {tilesDown ? (
        <p
          role="status"
          className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-control border border-warn/50 bg-surface px-3 py-1 text-small"
        >
          Fond de carte indisponible : la liste et les liens restent utilisables.
        </p>
      ) : null}
      {showZones && shapesState === "loading" ? (
        <p
          role="status"
          className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-control border border-border bg-surface px-3 py-1 text-small text-fg-muted"
        >
          Chargement des zones SPI…
        </p>
      ) : null}
      {showZones && shapesState === "error" ? (
        <p
          role="status"
          className="absolute top-2 left-1/2 z-[500] -translate-x-1/2 rounded-control border border-warn/50 bg-surface px-3 py-1 text-small"
        >
          Zones SPI indisponibles pour le moment.
        </p>
      ) : null}
    </div>
  );
}
