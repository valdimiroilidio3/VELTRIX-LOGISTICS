"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapPin, Satellite } from "lucide-react";

export interface MapStop {
  id: string;
  sequence: number;
  city: string;
  latitude: number | null;
  longitude: number | null;
  trackingCode: string;
}

export function RouteMap({ stops, className }: { stops: MapStop[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const geocoded = stops.filter((stop) => stop.latitude !== null && stop.longitude !== null);

  useEffect(() => {
    setStyleUrl(process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? null);
  }, []);

  useEffect(() => {
    if (!styleUrl || geocoded.length === 0 || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [geocoded[0]!.longitude!, geocoded[0]!.latitude!],
        zoom: 8,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        const ordered = [...geocoded].sort((a, b) => a.sequence - b.sequence);
        if (ordered.length > 1) {
          map.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: ordered.map((stop) => [stop.longitude!, stop.latitude!]),
              },
            },
          });
          map.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": "#B8F36A", "line-width": 2.5, "line-dasharray": [2, 1.4] },
          });
        }
        for (const stop of ordered) {
          new maplibregl.Marker({ color: "#B8F36A" })
            .setLngLat([stop.longitude!, stop.latitude!])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setText(`${stop.sequence}. ${stop.city} · ${stop.trackingCode}`))
            .addTo(map);
        }
        const bounds = new maplibregl.LngLatBounds();
        for (const stop of ordered) bounds.extend([stop.longitude!, stop.latitude!]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 12 });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl, geocoded]);

  if (geocoded.length === 0) {
    return (
      <div className={`grid place-items-center rounded-xl border border-line/70 bg-bg/60 p-6 text-center text-xs text-muted ${className ?? ""}`}>
        <MapPin className="mb-2 h-4 w-4" />
        Nenhuma paragem tem coordenadas validadas. Sem geocodificação, o sistema não apresenta um mapa — não são
        inventadas localizações.
      </div>
    );
  }

  if (!styleUrl) {
    return <SchematicMap stops={geocoded} className={className} />;
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line/70 ${className ?? ""}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready ? (
        <div className="absolute inset-0 grid place-items-center bg-bg/70 text-xs text-muted">A carregar mapa…</div>
      ) : null}
      <div className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-bg/80 px-1.5 py-0.5 text-[10px] text-muted">
        <Satellite className="mr-1 inline h-3 w-3" />
        Tiles: fornecedor configurado em NEXT_PUBLIC_MAP_STYLE_URL
      </div>
    </div>
  );
}

/** Coordinate projection fallback: honest about not being a geographic map. */
function SchematicMap({ stops, className }: { stops: MapStop[]; className?: string }) {
  const lats = stops.map((stop) => stop.latitude as number);
  const lngs = stops.map((stop) => stop.longitude as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const pad = 0.12;
  const width = 600;
  const height = 320;

  const project = (stop: MapStop) => {
    const x = ((stop.longitude! - minLng) / Math.max(0.0001, maxLng - minLng)) * (1 - 2 * pad) + pad;
    const y = 1 - (((stop.latitude! - minLat) / Math.max(0.0001, maxLat - minLat)) * (1 - 2 * pad) + pad);
    return { x: x * width, y: y * height };
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line/70 bg-bg/60 ${className ?? ""}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Mapa esquemático de paragens">
        {Array.from({ length: 7 }).map((_, index) => (
          <line key={`v${index}`} x1={(index * width) / 6} y1="0" x2={(index * width) / 6} y2={height} stroke="#1b3347" strokeWidth="1" />
        ))}
        {Array.from({ length: 5 }).map((_, index) => (
          <line key={`h${index}`} x1="0" y1={(index * height) / 4} x2={width} y2={(index * height) / 4} stroke="#1b3347" strokeWidth="1" />
        ))}
        <polyline
          points={[...stops].sort((a, b) => a.sequence - b.sequence).map((stop) => `${project(stop).x},${project(stop).y}`).join(" ")}
          fill="none"
          stroke="#B8F36A"
          strokeWidth="2"
          strokeDasharray="6 4"
          opacity="0.8"
        />
        {stops.map((stop) => {
          const { x, y } = project(stop);
          return (
            <g key={stop.id}>
              <circle cx={x} cy={y} r="7" fill="#081522" stroke="#B8F36A" strokeWidth="2" />
              <text x={x} y={y + 3.5} fontSize="8" fill="#B8F36A" textAnchor="middle">
                {stop.sequence}
              </text>
              <text x={x + 12} y={y + 4} fontSize="10" fill="#9BAFC1">
                {stop.city}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-1.5 left-2 rounded bg-bg/85 px-2 py-1 text-[10px] text-muted">
        Mapa geográfico indisponível (sem fornecedor de tiles). Coordenadas projetadas.
      </div>
    </div>
  );
}
