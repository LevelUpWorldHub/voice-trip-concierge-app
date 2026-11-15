import { haversineMeters } from "@/lib/geo";
import { isOpen } from "@/lib/opening-hours";
import type { RouteFn } from "@/lib/planner";
import type { Itinerary, Place, Proposal, Stop } from "@/lib/types";

export const LONG_LEG_MINUTES = 40;
export const RAIN_PROBABILITY = 55;
const NEARBY_METERS = 8_000;

function pointOf(stop: Stop): Place {
  return {
    id: stop.placeId,
    name: stop.name,
    interest: stop.interest,
    lat: stop.lat,
    lon: stop.lon,
    indoor: stop.indoor,
    openingHours: stop.openingHours,
    address: stop.address,
  };
}

function isAcceptable(place: Place, date: string, arrival: string): boolean {
  return isOpen(place.openingHours, date, arrival) !== "closed";
}

function nearest(
  catalog: Place[],
  around: { lat: number; lon: number },
  used: Set<string>,
  date: string,
  arrival: string,
  predicate: (place: Place) => boolean,
): Place | undefined {
  return catalog
    .filter((place) => !used.has(place.id) && predicate(place) && isAcceptable(place, date, arrival))
    .map((place) => ({ place, meters: haversineMeters(around, place) }))
    .filter((item) => item.meters <= NEARBY_METERS)
    .sort((a, b) => a.meters - b.meters || a.place.id.localeCompare(b.place.id))[0]?.place;
}

export function inspectItinerary(
  itinerary: Itinerary,
  catalog: Place[],
  route: RouteFn,
): Proposal[] {
  const used = new Set(itinerary.days.flatMap((day) => day.stops.map((stop) => stop.placeId)));
  const proposals: Proposal[] = [];
  for (const day of itinerary.days) {
    day.stops.forEach((stop, index) => {
      const around = pointOf(stop);
      const hours = isOpen(stop.openingHours, day.date, stop.arrival);
      if (hours === "closed") {
        const replacement =
          nearest(catalog, around, used, day.date, stop.arrival, (place) => place.interest === stop.interest) ??
          nearest(catalog, around, used, day.date, stop.arrival, () => true);
        if (replacement) {
          proposals.push({
            id: `closed-${stop.id}`,
            stopId: stop.id,
            day: day.day,
            reason: "closed",
            detail: `${stop.name} is closed at ${stop.arrival} on ${day.date}. ${replacement.name} is open nearby.`,
            replacement,
          });
          return;
        }
      }
      const rainy = (day.weather?.precipProb ?? 0) >= RAIN_PROBABILITY;
      if (rainy && !stop.indoor) {
        const replacement = nearest(
          catalog,
          around,
          used,
          day.date,
          stop.arrival,
          (place) => place.indoor,
        );
        if (replacement) {
          proposals.push({
            id: `weather-${stop.id}`,
            stopId: stop.id,
            day: day.day,
            reason: "weather",
            detail: `${day.weather?.summary ?? "Rain"} gives a ${day.weather?.precipProb}% chance of precipitation. Swap the outdoor stop ${stop.name} for indoor ${replacement.name}.`,
            replacement,
          });
          return;
        }
      }
      const leg = day.legs[index - 1];
      const previous = day.stops[index - 1];
      if (leg && previous && leg.minutes > LONG_LEG_MINUTES) {
        const replacement = nearest(catalog, pointOf(previous), used, day.date, stop.arrival, (place) => {
          const driven = route(pointOf(previous), place);
          return driven.minutes <= LONG_LEG_MINUTES && driven.minutes < leg.minutes;
        });
        if (replacement) {
          proposals.push({
            id: `leg-${stop.id}`,
            stopId: stop.id,
            day: day.day,
            reason: "long-leg",
            detail: `The drive into ${stop.name} is ${leg.minutes} minutes. ${replacement.name} keeps this leg under ${LONG_LEG_MINUTES} minutes.`,
            replacement,
          });
        }
      }
    });
  }
  return proposals;
}
