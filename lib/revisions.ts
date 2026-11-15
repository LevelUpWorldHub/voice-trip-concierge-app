import { rescheduleDay, type RouteFn } from "@/lib/planner";
import type { Itinerary, Place } from "@/lib/types";
import { INTERESTS, type Interest } from "@/lib/types";

function placesOnDay(dayStops: Itinerary["days"][number]["stops"], catalog: Place[]): Place[] {
  return dayStops.map((stop) => {
    const known = catalog.find((place) => place.id === stop.placeId);
    if (known) return known;
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
  });
}

export function replaceStop(
  itinerary: Itinerary,
  stopId: string,
  replacement: Place,
  route: RouteFn,
  catalog: Place[] = [],
): Itinerary {
  const day = itinerary.days.find((item) => item.stops.some((stop) => stop.id === stopId));
  if (!day) return itinerary;
  const current = placesOnDay(day.stops, catalog);
  const index = day.stops.findIndex((stop) => stop.id === stopId);
  const nextPlaces = current.map((place, placeIndex) => (placeIndex === index ? replacement : place));
  const rescheduled = rescheduleDay(day, nextPlaces, route, itinerary.request.pace);
  return {
    ...itinerary,
    days: itinerary.days.map((item) => (item.day === day.day ? rescheduled : item)),
  };
}

function interestFromHint(hint: string): Interest | undefined {
  const text = hint.toLowerCase();
  return INTERESTS.find((interest) => text.includes(interest.replace(/s$/, "")) || text.includes(interest));
}

export function findReplacement(catalog: Place[], hint: string, exclude: Set<string>): Place | undefined {
  const query = hint.trim().toLowerCase();
  const named = catalog.find(
    (place) => !exclude.has(place.id) && place.name.toLowerCase().includes(query),
  );
  if (named) return named;
  const interest = interestFromHint(query);
  if (!interest) return undefined;
  return catalog.find((place) => !exclude.has(place.id) && place.interest === interest);
}

export function findStopByHint(itinerary: Itinerary, hint: string) {
  const query = hint.trim().toLowerCase();
  const stops = itinerary.days.flatMap((day) => day.stops);
  return (
    stops.find((stop) => stop.name.toLowerCase().includes(query)) ??
    stops.find((stop) => query.includes(stop.interest) || query.includes(stop.name.toLowerCase()))
  );
}

export function parseRevision(text: string): { target: string; replacement: string } | null {
  const match = text.match(
    /\b(?:swap|replace|change)\s+(?:the\s+)?(.+?)\s+(?:for|with|to)\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:[.!]|$)/i,
  );
  if (!match) return null;
  return { target: match[1].trim(), replacement: match[2].trim() };
}

export function reviseByText(
  itinerary: Itinerary,
  text: string,
  catalog: Place[],
  route: RouteFn,
): { itinerary: Itinerary; changed: boolean; message: string } {
  const parsed = parseRevision(text);
  if (!parsed) {
    return {
      itinerary,
      changed: false,
      message: "Tell me which stop to change, and what should replace it. Everything else stays put.",
    };
  }
  const stop = findStopByHint(itinerary, parsed.target);
  if (!stop) {
    return {
      itinerary,
      changed: false,
      message: `I couldn't find “${parsed.target}”, so every stop is still where it was.`,
    };
  }
  const used = new Set(itinerary.days.flatMap((day) => day.stops.map((item) => item.placeId)));
  used.delete(stop.placeId);
  const replacement = findReplacement(catalog, parsed.replacement, used);
  if (!replacement) {
    return {
      itinerary,
      changed: false,
      message: `I don't have a ${parsed.replacement} in the places already gathered, so I kept ${stop.name}.`,
    };
  }
  const next = replaceStop(itinerary, stop.id, replacement, route, catalog);
  return {
    itinerary: next,
    changed: true,
    message: `Replaced ${stop.name} with ${replacement.name}. The other stops are unchanged.`,
  };
}
