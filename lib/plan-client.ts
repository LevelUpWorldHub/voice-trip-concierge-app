"use client";

import { estimateDrive } from "@/lib/geo";
import { buildItinerary } from "@/lib/planner";
import { withResilience, type ResilientResult } from "@/lib/resilience";
import { buildSeattleSample, SEATTLE_PLACES } from "@/lib/seattle";
import type { Itinerary, Place, RouteLeg, ServiceHealth, TripRequest, WeatherDay } from "@/lib/types";

export type AssembledTrip = {
  itinerary: Itinerary;
  catalog: Place[];
  services: ServiceHealth[];
};

function serviceHealth(
  id: string,
  label: string,
  result: ResilientResult<unknown> | null,
): ServiceHealth {
  if (!result) return { id, label, status: "idle", detail: "Not called." };
  const last = result.attempts[result.attempts.length - 1];
  if (result.ok && result.source === "live") {
    return {
      id,
      label,
      status: result.attempts.length > 1 ? "degraded" : "ok",
      latencyMs: last?.latencyMs,
      detail: result.attempts.length > 1 ? `Recovered on attempt ${last?.attempt}.` : "Live response.",
    };
  }
  return {
    id,
    label,
    status: "down",
    latencyMs: last?.latencyMs,
    detail: result.ok ? "Using the labeled fallback." : result.error,
  };
}

async function readJson(response: Response): Promise<{ ok?: boolean; error?: string; [key: string]: unknown }> {
  return (await response.json()) as { ok?: boolean; error?: string };
}

export async function assembleTrip(request: TripRequest): Promise<AssembledTrip> {
  const geo = await withResilience({
    service: "nominatim",
    timeoutMs: 7000,
    retries: 2,
    task: async (signal) => {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(request.destination)}`, { signal });
      const body = await readJson(response);
      const place = body.place as { lat: number; lon: number; label: string } | undefined;
      if (!body.ok || !place) throw new Error(body.error || "Geocoding failed");
      return place;
    },
  });
  if (!geo.ok) {
    return {
      itinerary: buildSeattleSample(request, geo.error),
      catalog: SEATTLE_PLACES,
      services: [serviceHealth("nominatim", "Nominatim", geo)],
    };
  }
  const placesResult = await withResilience({
    service: "overpass",
    timeoutMs: 9000,
    retries: 2,
    task: async (signal) => {
      const response = await fetch(
        `/api/places?lat=${geo.value.lat}&lon=${geo.value.lon}&interests=${encodeURIComponent(request.interests.join(","))}`,
        { signal },
      );
      const body = await readJson(response);
      const places = body.places as Place[] | undefined;
      if (!body.ok || !places?.length) throw new Error(body.error || "No places");
      return places;
    },
  });
  if (!placesResult.ok) {
    return {
      itinerary: buildSeattleSample(request, placesResult.error),
      catalog: SEATTLE_PLACES,
      services: [
        serviceHealth("nominatim", "Nominatim", geo),
        serviceHealth("overpass", "Overpass", placesResult),
      ],
    };
  }
  const weatherResult = await withResilience({
    service: "open-meteo",
    timeoutMs: 7000,
    retries: 2,
    task: async (signal) => {
      const response = await fetch(`/api/weather?lat=${geo.value.lat}&lon=${geo.value.lon}`, { signal });
      const body = await readJson(response);
      const days = body.days as WeatherDay[] | undefined;
      if (!body.ok || !days?.length) throw new Error(body.error || "Forecast failed");
      return days;
    },
  });
  const warnings = weatherResult.ok ? [] : ["Weather is unavailable, so rain checks are paused."];
  const draft = buildItinerary({
    request,
    center: { lat: geo.value.lat, lon: geo.value.lon },
    places: placesResult.value,
    weather: weatherResult.ok ? weatherResult.value : undefined,
    dataSource: "live",
    warnings,
  });
  const legCache = new Map<string, RouteLeg>();
  const geometries: [number, number][][] = [];
  let driveFailed = false;
  let driveLatency = 0;
  for (const day of draft.days) {
    if (day.stops.length < 2) {
      geometries.push(day.geometry);
      continue;
    }
    const drive = await withResilience({
      service: "osrm",
      timeoutMs: 8000,
      retries: 2,
      task: async (signal) => {
        const response = await fetch("/api/drive", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: day.stops.map((stop) => ({ lat: stop.lat, lon: stop.lon })),
          }),
        });
        const body = await readJson(response);
        const legs = body.legs as { minutes: number; meters: number }[] | undefined;
        if (!body.ok || !legs) throw new Error(body.error || "Routing failed");
        return { legs, geometry: (body.geometry as [number, number][]) || [] };
      },
    });
    driveLatency = drive.attempts[drive.attempts.length - 1]?.latencyMs ?? driveLatency;
    if (!drive.ok) {
      driveFailed = true;
      geometries.push(day.stops.map((stop) => [stop.lat, stop.lon]));
      continue;
    }
    day.stops.forEach((stop, index) => {
      if (index === 0) return;
      const leg = drive.value.legs[index - 1];
      if (!leg) return;
      legCache.set(`${day.stops[index - 1].placeId}|${stop.placeId}`, { ...leg, source: "osrm" });
    });
    geometries.push(drive.value.geometry.length ? drive.value.geometry : day.stops.map((stop) => [stop.lat, stop.lon]));
  }
  if (driveFailed) warnings.push("Some drive times are estimates because OSRM did not answer.");
  const itinerary = buildItinerary({
    request,
    center: { lat: geo.value.lat, lon: geo.value.lon },
    places: placesResult.value,
    weather: weatherResult.ok ? weatherResult.value : undefined,
    dataSource: "live",
    warnings,
    route: (from, to) => legCache.get(`${from.id}|${to.id}`) ?? { ...estimateDrive(from, to), source: "estimate" },
  });
  itinerary.days.forEach((day, index) => {
    day.geometry = geometries[index] || day.geometry;
  });
  return {
    itinerary,
    catalog: placesResult.value,
    services: [
      serviceHealth("nominatim", "Nominatim", geo),
      serviceHealth("overpass", "Overpass", placesResult),
      serviceHealth("open-meteo", "Open-Meteo", weatherResult),
      {
        id: "osrm",
        label: "OSRM",
        status: driveFailed ? "degraded" : "ok",
        latencyMs: driveLatency,
        detail: driveFailed ? "At least one leg used a distance estimate." : "Driving legs came from OSRM.",
      },
    ],
  };
}
