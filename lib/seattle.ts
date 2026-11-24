import { estimateDrive } from "@/lib/geo";
import { scheduleDay, type RouteFn } from "@/lib/planner";
import { addDays, localIsoDate, weekdayIndex } from "@/lib/time";
import { hoursOpenExcept } from "@/lib/opening-hours";
import type { Itinerary, Place, RouteLeg, TripRequest, WeatherDay } from "@/lib/types";

export const SEATTLE_SAMPLE_LABEL = "Seattle sample snapshot";
export const SEATTLE_SAMPLE_START = "2026-11-16";

export const SEATTLE_CENTER = { lat: 47.6062, lon: -122.3321 };

export const SEATTLE_PLACES: Place[] = [
  {
    id: "pike-place",
    name: "Pike Place Market",
    interest: "markets",
    lat: 47.6097,
    lon: -122.3425,
    indoor: true,
    openingHours: "Mo-Su 09:00-18:00",
    address: "85 Pike St",
  },
  {
    id: "pike-chowder",
    name: "Pike Place Chowder",
    interest: "food",
    lat: 47.6094,
    lon: -122.3414,
    indoor: true,
    openingHours: "Mo-Su 11:00-17:00",
    address: "1530 Post Alley",
  },
  {
    id: "sam",
    name: "Seattle Art Museum",
    interest: "museums",
    lat: 47.6073,
    lon: -122.3381,
    indoor: true,
    openingHours: "Tu-Su 10:00-17:00",
    address: "1300 1st Ave",
  },
  {
    id: "sculpture-park",
    name: "Olympic Sculpture Park",
    interest: "parks",
    lat: 47.6166,
    lon: -122.3553,
    indoor: false,
    openingHours: "Mo-Su 09:00-18:00",
    address: "2901 Western Ave",
  },
  {
    id: "kerry",
    name: "Kerry Park",
    interest: "viewpoints",
    lat: 47.6295,
    lon: -122.3599,
    indoor: false,
    openingHours: "24/7",
    address: "211 W Highland Dr",
  },
  {
    id: "chihuly",
    name: "Chihuly Garden and Glass",
    interest: "museums",
    lat: 47.6205,
    lon: -122.3509,
    indoor: true,
    openingHours: "Mo-Su 10:00-20:00",
    address: "305 Harrison St",
  },
  {
    id: "mopop",
    name: "Museum of Pop Culture",
    interest: "museums",
    lat: 47.6215,
    lon: -122.3481,
    indoor: true,
    openingHours: "Mo-Su 10:00-17:00",
    address: "325 5th Ave N",
  },
  {
    id: "oddfellows",
    name: "Oddfellows Cafe",
    interest: "food",
    lat: 47.615,
    lon: -122.3188,
    indoor: true,
    openingHours: "Mo-Su 08:00-21:00",
    address: "1525 10th Ave",
  },
  {
    id: "elliott-books",
    name: "Elliott Bay Book Company",
    interest: "shopping",
    lat: 47.6149,
    lon: -122.3196,
    indoor: true,
    openingHours: "Mo-Sa 10:00-21:00; Su 11:00-19:00",
    address: "1521 10th Ave",
  },
  {
    id: "melrose-market",
    name: "Melrose Market",
    interest: "markets",
    lat: 47.6142,
    lon: -122.3264,
    indoor: true,
    openingHours: "Mo-Su 11:00-19:00",
    address: "1531 Melrose Ave",
  },
  {
    id: "uwajimaya",
    name: "Uwajimaya",
    interest: "markets",
    lat: 47.5969,
    lon: -122.3267,
    indoor: true,
    openingHours: "Mo-Su 08:00-22:00",
    address: "600 5th Ave S",
  },
  {
    id: "golden-gardens",
    name: "Golden Gardens Park",
    interest: "parks",
    lat: 47.6917,
    lon: -122.4026,
    indoor: false,
    openingHours: "Mo-Su 06:00-21:00",
    address: "8498 Seaview Pl NW",
  },
  {
    id: "discovery",
    name: "Discovery Park",
    interest: "parks",
    lat: 47.6573,
    lon: -122.4058,
    indoor: false,
    openingHours: "Mo-Su 06:00-22:00",
    address: "3801 Discovery Park Blvd",
  },
];

export const SEATTLE_WEATHER: WeatherDay[] = [
  { summary: "Clear and cool, 13°C", tempC: 13, precipProb: 10, code: 1 },
  { summary: "Rain likely, 11°C", tempC: 11, precipProb: 80, code: 63 },
  { summary: "Cloudy breaks, 12°C", tempC: 12, precipProb: 30, code: 3 },
];

const BY_ID = new Map(SEATTLE_PLACES.map((place) => [place.id, place]));

export function seattleRoute(from: { id?: string; lat: number; lon: number }, to: { id?: string; lat: number; lon: number }): RouteLeg {
  const ids = `${from.id ?? ""} ${to.id ?? ""}`;
  if (ids.includes("golden-gardens")) {
    return { minutes: 46, meters: 18_000, source: "snapshot" };
  }
  return { ...estimateDrive(from, to), source: "snapshot" };
}

const SAMPLE_DAYS = [
  ["pike-place", "sam", "kerry"],
  ["oddfellows", "sculpture-park", "elliott-books"],
  ["mopop", "chihuly", "golden-gardens"],
];

export function seattleRequest(partial?: Partial<TripRequest>, start = localIsoDate()): TripRequest {
  return {
    destination: partial?.destination?.trim() || "Seattle",
    days: partial?.days || 3,
    interests: partial?.interests?.length ? partial.interests : ["food", "parks", "museums"],
    pace: partial?.pace ?? "balanced",
    startDate: start,
  };
}

export function buildSeattleSample(
  partial?: Partial<TripRequest>,
  reason?: string,
  start = localIsoDate(),
): Itinerary {
  const request = seattleRequest(partial, start);
  const askedFor = request.destination;
  const askedForElsewhere = askedFor.toLowerCase() !== "seattle";
  const warnings = askedForElsewhere
    ? [
        `Not a plan for ${askedFor}. Live place data did not come back, and this app will not invent ${askedFor}.`,
        `${SEATTLE_SAMPLE_LABEL}. The stops below are Seattle practice data only.`,
        reason ? `What failed: ${reason}` : "No live lookup was used.",
      ]
    : [
        reason
          ? `${SEATTLE_SAMPLE_LABEL}. ${reason} These stops are built-in Seattle sample data, not a live map reply.`
          : `${SEATTLE_SAMPLE_LABEL}. Hours, weather, and drive times in this itinerary are built-in sample data for Seattle.`,
      ];
  const grouped = SAMPLE_DAYS.slice(0, Math.min(3, Math.max(1, request.days))).map((ids) =>
    ids.map((id) => BY_ID.get(id)!),
  );
  const route: RouteFn = (from, to) => seattleRoute(from, to);
  const sampleRequest: TripRequest = {
    ...request,
    destination: "Seattle",
    days: grouped.length,
    startDate: start,
  };
  return {
    id: "seattle-sample",
    destination: "Seattle",
    center: SEATTLE_CENTER,
    request: sampleRequest,
    dataSource: "snapshot",
    sampleLabel: SEATTLE_SAMPLE_LABEL,
    askedFor,
    sampleStandsIn: !askedForElsewhere,
    warnings,
    days: grouped.map((places, index) =>
      scheduleDay({
        day: index + 1,
        date: addDays(start, index),
        places: places.map((place) =>
          place.id === "sam" ? { ...place, openingHours: hoursOpenExcept(weekdayIndex(start)) } : place,
        ),
        route,
        pace: "balanced",
        weather: SEATTLE_WEATHER[index],
      }),
    ),
  };
}
