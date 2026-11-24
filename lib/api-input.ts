export type InputFailure = { ok: false; error: string };
export type InputOk<T> = { ok: true; value: T };

const CITY_MAX = 120;

export function validateCityQuery(raw: string | null): InputOk<string> | InputFailure {
  const query = (raw ?? "").trim();
  if (!query) return { ok: false, error: "Enter a city name." };
  if (query.length > CITY_MAX) return { ok: false, error: "Enter a city name." };
  if (!/^[\p{L}\p{N}\s.'-]+$/u.test(query)) return { ok: false, error: "Enter a city name." };
  return { ok: true, value: query };
}

export function validateCoordinate(latRaw: unknown, lonRaw: unknown): InputOk<{ lat: number; lon: number }> | InputFailure {
  const lat = typeof latRaw === "number" ? latRaw : Number(latRaw);
  const lon = typeof lonRaw === "number" ? lonRaw : Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: "Missing coordinates." };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, error: "Missing coordinates." };
  return { ok: true, value: { lat, lon } };
}

export type DrivePoint = { lat: number; lon: number };

export function validateDrivePoints(raw: unknown): InputOk<DrivePoint[]> | InputFailure {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { points?: unknown }).points)) {
    return { ok: false, error: "Need two or more coordinates." };
  }
  const points = (raw as { points: unknown[] }).points;
  if (points.length < 2 || points.length > 8) return { ok: false, error: "Need two or more coordinates." };
  const parsed: DrivePoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") return { ok: false, error: "Need two or more coordinates." };
    const check = validateCoordinate((point as { lat?: unknown }).lat, (point as { lon?: unknown }).lon);
    if (!check.ok) return { ok: false, error: "Need two or more coordinates." };
    parsed.push(check.value);
  }
  return { ok: true, value: parsed };
}

export function validatePulseCity(raw: unknown): InputOk<string> | InputFailure {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Enter a city name." };
  const city = String((raw as { city?: unknown }).city ?? "");
  const cleaned = city.replace(/[^\p{L}\p{N}\s.'-]/gu, "").trim().slice(0, 80);
  if (!cleaned) return { ok: false, error: "Enter a city name." };
  return { ok: true, value: cleaned };
}
