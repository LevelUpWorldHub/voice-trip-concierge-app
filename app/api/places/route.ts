import { connection } from "next/server";
import { errorMessage, rethrowIfNeeded } from "@/lib/server/upstream";
import { queryOverpass, readCoordinate, upstreamFailure } from "@/lib/server/overpass";
import { INTERESTS, type Interest, type Place } from "@/lib/types";

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
  const coords = readCoordinate(params.get("lat"), params.get("lon"));
  if (!coords) {
    return Response.json({ ok: false, error: "Missing coordinates." }, { status: 400 });
  }
  const { lat, lon } = coords;
  const requested = (params.get("interests") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is Interest => (INTERESTS as readonly string[]).includes(item));
  const interests = requested.length ? requested : [...INTERESTS];
  const clauses = interests
    .map((interest) => `${QUERIES[interest]}(around:3500,${lat},${lon});`)
    .join("\n");
  const query = `[out:json][timeout:6];(\n${clauses}\n);out body 40;`;
  try {
    const result = await queryOverpass(query);
    const elements = result.elements;
    if (!elements) {
      return upstreamFailure(result.error || "Places were unavailable.", result.attempts, result.latencyMs);
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
    return upstreamFailure(errorMessage(error), [], 0);
  }
}
