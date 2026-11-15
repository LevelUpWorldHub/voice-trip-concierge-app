import { estimateDrive } from "@/lib/geo";
import { addDays, clamp, formatDayLabel, formatMinutes } from "@/lib/time";
import type {
  DayPlan,
  Interest,
  Itinerary,
  Leg,
  Pace,
  Place,
  RouteLeg,
  Stop,
  TripRequest,
  WeatherDay,
} from "@/lib/types";

export const PACE_STOPS: Record<Pace, number> = {
  relaxed: 3,
  balanced: 4,
  packed: 5,
};

const DWELL_MINUTES: Record<Interest, number> = {
  food: 70,
  parks: 50,
  museums: 85,
  viewpoints: 30,
  shopping: 50,
  nightlife: 75,
  markets: 55,
};

const PACE_FACTOR: Record<Pace, number> = {
  relaxed: 1.1,
  balanced: 1,
  packed: 0.85,
};

export type RouteFn = (from: Place | Stop, to: Place | Stop) => RouteLeg;

function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

function pickDiverse(places: Place[], limit: number): Place[] {
  if (places.length <= limit) return places;
  const buckets = new Map<Interest, Place[]>();
  for (const place of places) {
    const list = buckets.get(place.interest) ?? [];
    list.push(place);
    buckets.set(place.interest, list);
  }
  const chosen: Place[] = [];
  while (chosen.length < limit) {
    let progressed = false;
    for (const list of buckets.values()) {
      const next = list.shift();
      if (!next) continue;
      chosen.push(next);
      progressed = true;
      if (chosen.length === limit) break;
    }
    if (!progressed) break;
  }
  return chosen;
}

function nearestNeighbor(places: Place[]): Place[] {
  if (places.length <= 1) return [...places];
  const remaining = [...places].sort(
    (a, b) => a.lat - b.lat || a.lon - b.lon || a.id.localeCompare(b.id),
  );
  const ordered: Place[] = [remaining.shift()!];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let best = Number.POSITIVE_INFINITY;
    remaining.forEach((place, index) => {
      const distance = estimateDrive(current, place).meters;
      if (distance < best || (distance === best && place.id < remaining[bestIndex].id)) {
        best = distance;
        bestIndex = index;
      }
    });
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }
  return ordered;
}

function liftFoodTowardMidday(places: Place[]): Place[] {
  const foodIndex = places.findIndex((place) => place.interest === "food" || place.interest === "markets");
  if (foodIndex <= 0 || places.length < 3) return places;
  const next = [...places];
  const [food] = next.splice(foodIndex, 1);
  const mid = Math.min(next.length, Math.max(1, Math.floor(next.length / 2)));
  next.splice(mid, 0, food);
  return next;
}

export function draftDays(places: Place[], request: TripRequest): Place[][] {
  const days = clamp(Math.round(request.days) || 1, 1, 7);
  const perDay = PACE_STOPS[request.pace] ?? PACE_STOPS.balanced;
  const wanted = new Set(request.interests);
  let pool = places.filter((place) => wanted.has(place.interest));
  if (pool.length < days) pool = places;
  const sorted = dedupe(pool).sort(
    (a, b) => a.lon - b.lon || a.lat - b.lat || a.id.localeCompare(b.id),
  );
  const size = Math.max(1, Math.ceil(sorted.length / days));
  const chunks: Place[][] = [];
  for (let day = 0; day < days; day += 1) {
    const slice = sorted.slice(day * size, (day + 1) * size);
    const picked = liftFoodTowardMidday(nearestNeighbor(pickDiverse(slice, perDay)));
    if (picked.length) chunks.push(picked);
  }
  return chunks;
}

export function scheduleDay(input: {
  day: number;
  date: string;
  places: Place[];
  route: RouteFn;
  pace: Pace;
  weather?: WeatherDay;
}): DayPlan {
  const factor = PACE_FACTOR[input.pace] ?? 1;
  let cursor = 10 * 60;
  const stops: Stop[] = [];
  const legs: Leg[] = [];
  input.places.forEach((place, index) => {
    const id = `${place.id}-d${input.day}`;
    if (index > 0) {
      const previous = input.places[index - 1];
      const driven = input.route(previous, place);
      cursor += driven.minutes;
      legs.push({
        fromId: `${previous.id}-d${input.day}`,
        toId: id,
        minutes: driven.minutes,
        meters: driven.meters,
        source: driven.source,
      });
    }
    const dwellMinutes = Math.max(20, Math.round(DWELL_MINUTES[place.interest] * factor));
    stops.push({
      id,
      placeId: place.id,
      name: place.name,
      interest: place.interest,
      lat: place.lat,
      lon: place.lon,
      indoor: place.indoor,
      openingHours: place.openingHours,
      address: place.address,
      day: input.day,
      arrival: formatMinutes(cursor),
      depart: formatMinutes(cursor + dwellMinutes),
      dwellMinutes,
    });
    cursor += dwellMinutes;
  });
  return {
    day: input.day,
    date: input.date,
    title: `Day ${input.day} · ${formatDayLabel(input.date)}`,
    stops,
    legs,
    weather: input.weather,
    geometry: stops.map((stop) => [stop.lat, stop.lon]),
  };
}

export function buildItinerary(input: {
  request: TripRequest;
  center: { lat: number; lon: number };
  places: Place[];
  route?: RouteFn;
  weather?: WeatherDay[];
  dataSource: "live" | "snapshot";
  sampleLabel?: string;
  warnings?: string[];
  id?: string;
}): Itinerary {
  const route = input.route ?? ((from, to) => estimateDrive(from, to));
  const grouped = draftDays(input.places, input.request);
  const days = grouped.map((places, index) =>
    scheduleDay({
      day: index + 1,
      date: addDays(input.request.startDate, index),
      places,
      route,
      pace: input.request.pace,
      weather: input.weather?.[index],
    }),
  );
  const warnings = [...(input.warnings ?? [])];
  if (!days.length) warnings.push("No places were available to schedule.");
  return {
    id: input.id ?? `${input.dataSource}-${input.request.destination.toLowerCase().replace(/\s+/g, "-")}`,
    destination: input.request.destination,
    center: input.center,
    request: input.request,
    days,
    dataSource: input.dataSource,
    sampleLabel: input.sampleLabel,
    warnings,
  };
}

export function rescheduleDay(day: DayPlan, places: Place[], route: RouteFn, pace: Pace): DayPlan {
  return scheduleDay({
    day: day.day,
    date: day.date,
    places,
    route,
    pace,
    weather: day.weather,
  });
}
