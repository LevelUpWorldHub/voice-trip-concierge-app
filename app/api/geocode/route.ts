import { connection } from "next/server";
import { validateCityQuery } from "@/lib/api-input";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";

export async function GET(request: Request) {
  await connection();
  const parsed = validateCityQuery(new URL(request.url).searchParams.get("q"));
  if (!parsed.ok) return Response.json(parsed);
  const query = parsed.value;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const result = await fetchJson(url.toString(), {}, 7000);
    const rows = Array.isArray(result.data) ? result.data : [];
    const first = rows[0] as { lat?: string; lon?: string; display_name?: string } | undefined;
    if (!result.ok || !first?.lat || !first.lon) {
      return Response.json({
        ok: false,
        error: result.error || "No matching place.",
        latencyMs: result.latencyMs,
      });
    }
    return Response.json({
      ok: true,
      latencyMs: result.latencyMs,
      place: {
        lat: Number(first.lat),
        lon: Number(first.lon),
        label: first.display_name || query,
      },
    });
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}
