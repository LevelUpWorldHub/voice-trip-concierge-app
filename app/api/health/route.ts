import { connection } from "next/server";
import { extraAiEnabled, grokHealthRow } from "@/lib/feature-flags";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";
import type { ServiceHealth } from "@/lib/types";

export async function GET() {
  await connection();
  try {
    const [nominatim, overpass, osrm, meteo] = await Promise.all([
      fetchJson("https://nominatim.openstreetmap.org/search?q=Seattle&format=jsonv2&limit=1", {}, 4000),
      fetchJson(
        "https://overpass.openstreetmap.fr/api/interpreter",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: '[out:json][timeout:4];node["tourism"="museum"](around:500,47.6062,-122.3321);out 1;' }),
        },
        4000,
      ),
      fetchJson(
        "https://router.project-osrm.org/route/v1/driving/-122.3321,47.6062;-122.3425,47.6097?overview=false",
        {},
        4000,
      ),
      fetchJson("https://api.open-meteo.com/v1/forecast?latitude=47.6&longitude=-122.33&current=temperature_2m", {}, 4000),
    ]);
    const services: ServiceHealth[] = [
      probe("nominatim", "Nominatim", nominatim),
      probe("overpass", "Overpass", overpass),
      probe("osrm", "OSRM", osrm),
      probe("open-meteo", "Open-Meteo", meteo),
      ...[grokHealthRow(extraAiEnabled(), process.env.XAI_API_KEY, process.env.XAI_MODEL)].filter(
        (row): row is NonNullable<typeof row> => row !== null,
      ),
      {
        id: "firebase",
        label: "Firebase AI Logic",
        status: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "idle" : "off",
        detail: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
          ? "Web config is present. The browser reports on-device or cloud after the first prompt."
          : "No web config. Intent and narration use the deterministic fallback.",
      },
    ];
    return Response.json({ ok: true, services });
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({ ok: false, error: errorMessage(error), services: [] });
  }
}

function probe(
  id: string,
  label: string,
  result: { ok: boolean; latencyMs: number; error?: string },
): ServiceHealth {
  return {
    id,
    label,
    status: result.ok ? "ok" : "down",
    latencyMs: result.latencyMs,
    detail: result.ok ? "Probe succeeded." : result.error || "Probe failed.",
  };
}
