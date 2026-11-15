import type { Point, RouteLeg } from "@/lib/types";

const EARTH_METERS = 6_371_000;

export function haversineMeters(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Urban drive estimate used when OSRM does not answer. Deterministic and local. */
export function estimateDrive(a: Point, b: Point): RouteLeg {
  const meters = Math.round(haversineMeters(a, b) * 1.35);
  const minutes = Math.max(4, Math.round((meters / 1000 / 28) * 60));
  return { minutes, meters, source: "estimate" };
}
