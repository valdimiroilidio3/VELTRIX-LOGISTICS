import { estimateDurationMin, estimateRoadKm } from "@/lib/routing/geo";

/**
 * Route/distance providers.
 *
 * VELTRIX never invents driving distances. When no provider is configured the
 * caller receives `null` and must present a straight-line estimate, clearly
 * labelled as such (see `estimateLegs` in geo.ts).
 *
 * Supported:
 *   - OSRM (self-hosted or demo server) → ROUTING_BASE_URL
 *   - openrouteservice                    → ROUTING_API_KEY
 *   - GraphHopper                         → ROUTING_API_KEY
 */

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteLeg {
  distanceKm: number;
  durationMin: number;
}

export interface ProviderRoute {
  provider: string;
  distanceKm: number;
  durationMin: number;
  legs: RouteLeg[];
  /** Polyline as [lat, lng] pairs when the provider returns geometry. */
  geometry: [number, number][] | null;
  /** true when the provider is a public demo server without SLA */
  demoEndpoint: boolean;
}

export interface RoutingProvider {
  name: string;
  configured: boolean;
  /** why it is not configured, shown in the UI */
  reason?: string;
  route(points: RoutePoint[]): Promise<ProviderRoute>;
}

class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function pickProvider(): RoutingProvider | null {
  const explicit = (process.env.ROUTING_PROVIDER ?? "").toLowerCase();
  const baseUrl = process.env.ROUTING_BASE_URL;
  const apiKey = process.env.ROUTING_API_KEY;

  if (explicit === "osrm" || (!explicit && baseUrl)) {
    if (!baseUrl) return null;
    return osrmProvider(baseUrl);
  }
  if (explicit === "openrouteservice") {
    if (!apiKey) return null;
    return openRouteServiceProvider(apiKey);
  }
  if (explicit === "graphhopper") {
    if (!apiKey) return null;
    return graphHopperProvider(apiKey);
  }
  return null;
}

let cached: { provider: RoutingProvider | null } | null = null;

export function getRoutingProvider(): RoutingProvider | null {
  if (!cached) cached = { provider: pickProvider() };
  return cached.provider;
}

export function routingStatus(): { configured: boolean; provider: string | null; note: string } {
  const provider = getRoutingProvider();
  if (!provider) {
    return {
      configured: false,
      provider: null,
      note: "Sem motor de rotas configurado: as distâncias são estimativas em linha reta e não há otimização real.",
    };
  }
  return {
    configured: true,
    provider: provider.name,
    note: provider.reason ?? "Motor de rotas ativo.",
  };
}

function osrmProvider(baseUrl: string): RoutingProvider {
  const trimmed = baseUrl.replace(/\/$/, "");
  return {
    name: "OSRM",
    configured: true,
    async route(points) {
      if (points.length < 2) throw new ProviderError("São necessários pelo menos dois pontos.");
      const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(";");
      const url = `${trimmed}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new ProviderError(`OSRM respondeu ${response.status}`, response.status);
      const data = (await response.json()) as {
        code?: string;
        routes?: { distance: number; duration: number; legs?: { distance: number; duration: number }[]; geometry?: { coordinates: [number, number][] } }[];
      };
      const route = data.routes?.[0];
      if (data.code !== "Ok" || !route) throw new ProviderError(`OSRM não devolveu rota (${data.code ?? "sem código"})`);
      return {
        provider: "OSRM",
        distanceKm: round(route.distance / 1000),
        durationMin: Math.round(route.duration / 60),
        legs: (route.legs ?? []).map((leg) => ({ distanceKm: round(leg.distance / 1000), durationMin: Math.round(leg.duration / 60) })),
        geometry: route.geometry ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : null,
        demoEndpoint: trimmed.includes("router.project-osrm.org"),
      };
    },
  };
}

function openRouteServiceProvider(apiKey: string): RoutingProvider {
  return {
    name: "openrouteservice",
    configured: true,
    async route(points) {
      if (points.length < 2) throw new ProviderError("São necessários pelo menos dois pontos.");
      const response = await fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
        method: "POST",
        headers: { authorization: apiKey, "content-type": "application/json" },
        body: JSON.stringify({ coordinates: points.map((point) => [point.longitude, point.latitude]) }),
      });
      if (!response.ok) throw new ProviderError(`openrouteservice respondeu ${response.status}`, response.status);
      const data = (await response.json()) as {
        features?: { properties?: { summary?: { distance: number; duration: number }; segments?: { distance: number; duration: number }[] }; geometry?: { coordinates: [number, number][] } }[];
      };
      const feature = data.features?.[0];
      if (!feature?.properties?.summary) throw new ProviderError("openrouteservice não devolveu sumário de rota");
      const summary = feature.properties.summary;
      return {
        provider: "openrouteservice",
        distanceKm: round(summary.distance / 1000),
        durationMin: Math.round(summary.duration / 60),
        legs: (feature.properties.segments ?? []).map((segment) => ({ distanceKm: round(segment.distance / 1000), durationMin: Math.round(segment.duration / 60) })),
        geometry: feature.geometry ? feature.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : null,
        demoEndpoint: false,
      };
    },
  };
}

function graphHopperProvider(apiKey: string): RoutingProvider {
  return {
    name: "GraphHopper",
    configured: true,
    async route(points) {
      if (points.length < 2) throw new ProviderError("São necessários pelo menos dois pontos.");
      const params = new URLSearchParams({
        profile: "truck",
        points_encoded: "false",
        key: apiKey,
      });
      points.forEach((point) => params.append("point", `${point.latitude},${point.longitude}`));
      const response = await fetch(`https://graphhopper.com/api/1/route?${params.toString()}`);
      if (!response.ok) throw new ProviderError(`GraphHopper respondeu ${response.status}`, response.status);
      const data = (await response.json()) as {
        paths?: { distance: number; time: number; points?: { coordinates: [number, number][] } }[];
      };
      const path = data.paths?.[0];
      if (!path) throw new ProviderError("GraphHopper não devolveu rota");
      return {
        provider: "GraphHopper",
        distanceKm: round(path.distance / 1000),
        durationMin: Math.round(path.time / 60000),
        legs: [],
        geometry: path.points ? path.points.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : null,
        demoEndpoint: false,
      };
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Result shape consumed by the route domain layer. */
export interface RouteResult {
  provider: string;
  totalDistanceKm: number;
  totalDurationMin: number;
  /** true when the numbers come from a geometric estimate, not a routing engine */
  estimated: boolean;
  geometry: [number, number][] | null;
}

/**
 * Resolves the driving distance between consecutive points.
 * Returns an explicitly-labelled estimate when no provider is configured or the
 * provider fails — never a silent fake "optimised" value.
 */
export async function routeBetween(points: { lat: number; lng: number }[]): Promise<RouteResult> {
  if (points.length < 2) {
    return { provider: "n/d", totalDistanceKm: 0, totalDurationMin: 0, estimated: true, geometry: null };
  }

  const provider = getRoutingProvider();
  if (provider) {
    try {
      const result = await provider.route(points.map((point) => ({ latitude: point.lat, longitude: point.lng })));
      return {
        provider: result.provider,
        totalDistanceKm: result.distanceKm,
        totalDurationMin: result.durationMin,
        estimated: false,
        geometry: result.geometry,
      };
    } catch (error) {
      console.error("[routing] provider failed, falling back to estimate:", (error as Error).message);
    }
  }

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += estimateRoadKm(points[index - 1]!, points[index]!);
  }
  return {
    provider: provider ? `${provider.name} (indisponível)` : "estimativa geométrica",
    totalDistanceKm: Math.round(total * 10) / 10,
    totalDurationMin: estimateDurationMin(total),
    estimated: true,
    geometry: null,
  };
}

export { ProviderError };
