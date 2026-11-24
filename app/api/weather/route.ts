import { connection } from "next/server";
import { validateCoordinate } from "@/lib/api-input";
import { errorMessage, fetchJson, rethrowIfNeeded } from "@/lib/server/upstream";
import { weatherFromDaily } from "@/lib/weather";

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const coords = validateCoordinate(params.get("lat"), params.get("lon"));
  if (!coords.ok) return Response.json(coords);
  const { lat, lon } = coords.value;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("daily", "weather_code,temperature_2m_max,precipitation_probability_max");
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("timezone", "auto");
    const result = await fetchJson(url.toString(), {}, 7000);
    const daily = (result.data as { daily?: Parameters<typeof weatherFromDaily>[0] } | null)?.daily;
    if (!result.ok || !daily?.time?.length) {
      return Response.json({ ok: false, error: result.error || "Forecast unavailable.", latencyMs: result.latencyMs });
    }
    return Response.json({ ok: true, days: weatherFromDaily(daily), latencyMs: result.latencyMs });
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({ ok: false, error: errorMessage(error) });
  }
}
