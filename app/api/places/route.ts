import { connection } from "next/server";
import { validateCoordinate } from "@/lib/api-input";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";
import { INTERESTS, type Interest, type Place } from "@/lib/types";

const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const QUERIES: Record<Interest, string> = {
  food: 'node["amenity"~"restaurant|cafe"]',
  parks: 'node["leisure"="park"]',
  museums: 'node["tourism"~"museum|gallery"]',
  viewpoints: 'node["tourism"="viewpoint"]',
  shopping: 'node["shop"~"mall|department_store|books"]',
  nightlife: 'node["amenity"~"bar|pub|nightclub"]',
  markets: 'node["amenity"="marketplace"]',
};

function interestFromTags(tags: Record<string, string>): Interest | null {
  if (tags.leisure === "park") return "parks";
  if (tags.tourism === "viewpoint") return "viewpoints";
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "museums";
  if (tags.amenity === "marketplace") return "markets";
  if (tags.shop) return "shopping";
  if (tags.amenity === "bar" || tags.amenity === "pub" || tags.amenity === "nightclub") return "nightlife";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe") return "food";
  return null;
}

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const coords = validateCoordinate(params.get("lat"), params.get("lon"));
  if (!coords.ok) return Response.json(coords);
  const { lat, lon } = coords.value;
  const requested = (params.get("interests") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is Interest => (INTERESTS as readonly string[]).includes(item));
  const interests = requested.length ? requested : [...INTERESTS];
  const clauses = interests
    .map((interest) => `${QUERIES[interest]}(around:3500,${lat},${lon});`)
    .join("\n");
  const query = `[out:json][timeout:8];(\n${clauses}\n);out body 40;`;
  try {
    let result: Awaited<ReturnType<typeof fetchJson>> | null = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const attempt = await fetchJson(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
        },
        8000,
      );
      const elements = (attempt.data as { elements?: unknown[] } | null)?.elements;
      if (attempt.ok && Array.isArray(elements)) {
        result = attempt;
        break;
      }
      result = attempt;
    }
    const elements = (result?.data as { elements?: unknown[] } | null)?.elements;
    if (!result?.ok || !Array.isArray(elements)) {
      return Response.json({ ok: false, error: result?.error || "Places were unavailable.", latencyMs: result?.latencyMs });
    }
    const places: Place[] = [];
    const seen = new Set<string>();
    for (const element of elements) {
      const row = element as {
        type?: string;
        id?: number;
        lat?: number;
        lon?: number;
        tags?: Record<string, string>;
      };
      const tags = row.tags || {};
      const interest = interestFromTags(tags);
      if (!interest || !tags.name || row.lat == null || row.lon == null) continue;
      const key = tags.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({
        id: `${row.type || "node"}/${row.id}`,
        name: tags.name,
        interest,
        lat: row.lat,
        lon: row.lon,
        indoor: interest !== "parks" && interest !== "viewpoints",
        openingHours: tags.opening_hours,
        address: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
      });
      if (places.length >= 24) break;
    }
    if (!places.length) return Response.json({ ok: false, error: "No named places nearby.", latencyMs: result.latencyMs });
    return Response.json({ ok: true, places, latencyMs: result.latencyMs });
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}
