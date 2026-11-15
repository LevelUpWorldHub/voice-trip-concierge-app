import { connection } from "next/server";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";

type Point = { lat: number; lon: number };

export async function POST(request: Request) {
  await connection();
  try {
    const body = (await request.json()) as { points?: Point[] };
    const points = Array.isArray(body.points) ? body.points.slice(0, 8) : [];
    if (points.length < 2 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lon))) {
      return Response.json({ ok: false, error: "Need two or more coordinates." });
    }
    const path = points.map((point) => `${point.lon},${point.lat}`).join(";");
    const result = await fetchJson(
      `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`,
      {},
      8000,
    );
    const route = (result.data as { code?: string; routes?: { duration: number; distance: number; legs?: { duration: number; distance: number }[]; geometry?: { coordinates?: [number, number][] } }[] } | null)
      ?.routes?.[0];
    if (!result.ok || !route) {
      return Response.json({ ok: false, error: result.error || "No driving route.", latencyMs: result.latencyMs });
    }
    return Response.json({
      ok: true,
      latencyMs: result.latencyMs,
      legs: (route.legs || []).map((leg) => ({
        minutes: Math.max(1, Math.round(leg.duration / 60)),
        meters: Math.round(leg.distance),
      })),
      geometry: (route.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]),
    });
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}
