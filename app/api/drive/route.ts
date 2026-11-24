import { connection } from "next/server";
import { validateDrivePoints } from "@/lib/api-input";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json();
    const parsed = validateDrivePoints(body);
    if (!parsed.ok) return Response.json(parsed);
    const points = parsed.value;
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
