import type { WeatherDay } from "@/lib/types";

export function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed skies";
}

export function weatherFromDaily(input: {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  precipitation_probability_max?: number[];
}): WeatherDay[] {
  const days = input.time?.length ?? 0;
  const result: WeatherDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const code = input.weather_code?.[index] ?? 0;
    const temp = input.temperature_2m_max?.[index] ?? 12;
    const precip = input.precipitation_probability_max?.[index] ?? 0;
    result.push({
      code,
      tempC: Math.round(temp),
      precipProb: Math.round(precip),
      summary: `${describeWeatherCode(code)}, ${Math.round(temp)}°C`,
    });
  }
  return result;
}
