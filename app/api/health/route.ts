import { connection } from "next/server";
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
      {
        id: "grok",
        label: "Grok city pulse",
        status: process.env.XAI_API_KEY ? "idle" : "off",
        detail: process.env.XAI_API_KEY
          ? `Ready with ${process.env.XAI_MODEL || "grok-4.7"}. It is not used for planning.`
          : "Off until XAI_API_KEY is set. Planning does not use it.",
      },
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
