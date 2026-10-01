"use client";

import { useEffect, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapIcon } from "lucide-react";

import type { LngLat } from "@/lib/domain/ors";

// Tuiles vectorielles OpenFreeMap : gratuites, sans clé ni compte.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: LngLat = [2.35, 46.6];
const ROUTE_SOURCE = "route";
// Style minimal sans ressource externe, utilisé si OpenFreeMap est injoignable :
// le tracé et les marqueurs restent visibles sur un fond uni.
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8edf2" } }],
};

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

function markerElement(index: number, highlighted: boolean) {
  const el = document.createElement("div");
  el.className = [
    "flex size-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold shadow-md",
    highlighted ? "bg-red-600 text-white" : "bg-neutral-900 text-white",
  ].join(" ");
  el.textContent = String(index + 1);
  return el;
}

/**
 * Carte MapLibre : marqueurs numérotés, tracé de l'itinéraire, clic pour ajouter une étape.
 * Si WebGL n'est pas disponible, un message remplace la carte (le reste de la page fonctionne).
 */
export function RouteMap({
  stops,
  geometry,
  highlightIndex,
  onMapClick,
}: {
  stops: MapStop[];
  geometry: LngLat[] | null;
  highlightIndex?: number;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const geometryRef = useRef<LngLat[] | null>(geometry);
  const clickRef = useRef(onMapClick);
  const [unavailable, setUnavailable] = useState(false);
  const [styleError, setStyleError] = useState(false);

  useEffect(() => {
    clickRef.current = onMapClick;
  }, [onMapClick]);

  // Création de la carte (une seule fois)
  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: 4.5,
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.warn("Carte indisponible", error);
      // Échec synchrone (WebGL absent) : on affiche le message de repli.
      queueMicrotask(() => setUnavailable(true));
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (event) => clickRef.current?.(event.lngLat.lat, event.lngLat.lng));
    let usingFallback = false;
    map.on("error", (event) => {
      console.warn("Erreur de carte", event.error);
      // Le style distant n'a pas pu être chargé : on bascule sur le style de repli.
      if (!usingFallback && !map.isStyleLoaded()) {
        usingFallback = true;
        setStyleError(true);
        map.setStyle(FALLBACK_STYLE);
      }
    });
    // (Ré)ajoute le tracé à chaque chargement de style (initial ou repli).
    map.on("style.load", () => {
      if (map.getSource(ROUTE_SOURCE)) return;
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: lineData(geometryRef.current) });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#2563eb", "line-width": 4.5 },
      });
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Tracé
  useEffect(() => {
    geometryRef.current = geometry;
    const source = mapRef.current?.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(lineData(geometry));
  }, [geometry]);

  // Marqueurs
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = stops.map((stop, index) =>
      new Marker({ element: markerElement(index, index === highlightIndex) })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(new Popup({ offset: 18, closeButton: false }).setText(`${index + 1}. ${stop.name}`))
        .addTo(map),
    );
  }, [stops, highlightIndex]);

  // Cadrage quand l'ensemble des étapes change
  const boundsKey = stops.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`).sort().join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundsKey) return;
    const points = boundsKey.split("|").map((p) => p.split(",").map(Number) as [number, number]);
    if (points.length === 1) {
      map.easeTo({ center: [points[0][1], points[0][0]], zoom: Math.max(map.getZoom(), 9) });
      return;
    }
    const bounds = new LngLatBounds();
    points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 600 });
  }, [boundsKey]);

  if (unavailable) {
    return (
      <div className="bg-muted text-muted-foreground flex h-full min-h-72 flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center text-sm">
        <MapIcon className="size-6" />
        Carte indisponible sur ce navigateur (WebGL requis). La liste des étapes reste utilisable.
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-xl border">
      {/* MapLibre impose « position: relative » au conteneur : dimensionné en h-full plutôt qu'en absolu. */}
      <div ref={containerRef} className="h-full w-full" data-testid="route-map" />
      {styleError && (
        <div className="bg-background/90 absolute inset-x-3 bottom-3 rounded-md border px-3 py-2 text-xs">
          Fond de carte indisponible (OpenFreeMap injoignable) : seuls les étapes et le tracé sont affichés.
        </div>
      )}
    </div>
  );
}

function lineData(geometry: LngLat[] | null): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: geometry ?? [] },
  };
}
