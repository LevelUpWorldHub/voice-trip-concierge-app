import { describe, expect, it } from "vitest";
import { buildItinerary } from "@/lib/planner";
import { replaceStop, reviseByText } from "@/lib/revisions";
import { inspectItinerary } from "@/lib/autonomy";
import { estimateDrive } from "@/lib/geo";
import { buildSeattleSample, seattleRoute, SEATTLE_PLACES } from "@/lib/seattle";
import type { Place, TripRequest } from "@/lib/types";

const catalog: Place[] = [
  { id: "museum", name: "City Museum", interest: "museums", lat: 47.6, lon: -122.33, indoor: true, openingHours: "Mo-Su 10:00-17:00" },
  { id: "market", name: "Sunday Market", interest: "markets", lat: 47.61, lon: -122.34, indoor: true, openingHours: "Mo-Su 09:00-16:00" },
  { id: "park", name: "Harbor Park", interest: "parks", lat: 47.62, lon: -122.35, indoor: false, openingHours: "Mo-Su 06:00-21:00" },
  { id: "cafe", name: "Corner Cafe", interest: "food", lat: 47.6, lon: -122.32, indoor: true, openingHours: "Mo-Su 08:00-18:00" },
  { id: "view", name: "Hill Viewpoint", interest: "viewpoints", lat: 47.63, lon: -122.31, indoor: false, openingHours: "24/7" },
  { id: "books", name: "Book Room", interest: "shopping", lat: 47.59, lon: -122.3, indoor: true, openingHours: "Mo-Su 10:00-19:00" },
];

const request: TripRequest = {
  destination: "Harbor City",
  days: 2,
  interests: ["museums", "markets", "parks", "food", "viewpoints", "shopping"],
  pace: "packed",
  startDate: "2026-11-16",
};

describe("revisions", () => {
  it("replaces one stop and leaves every other stop in place", () => {
    const route = (from: Place, to: Place) => ({ ...estimateDrive(from, to), source: "estimate" as const });
    const original = buildItinerary({
      request,
      center: { lat: 47.6, lon: -122.33 },
      places: catalog,
      route,
      dataSource: "live",
    });
    const target = original.days[0].stops[0];
    const replacement = catalog.find((place) => place.id !== target.placeId)!;
    const revised = replaceStop(original, target.id, replacement, route, catalog);
    expect(revised.days[0].stops[0].placeId).toBe(replacement.id);
    expect(revised.days[0].stops[0].name).toBe(replacement.name);
    original.days[0].stops.slice(1).forEach((stop, index) => {
      expect(revised.days[0].stops[index + 1].placeId).toBe(stop.placeId);
    });
    expect(revised.days.slice(1)).toEqual(original.days.slice(1));
    expect(revised.days[0].stops[0].id).not.toBe(target.id);
  });

  it("parses a swap sentence and changes only the named stop", () => {
    const route = (from: Place, to: Place) => ({ ...estimateDrive(from, to), source: "estimate" as const });
    const original = buildItinerary({
      request,
      center: { lat: 47.6, lon: -122.33 },
      places: catalog,
      route,
      dataSource: "live",
    });
    const museum = original.days.flatMap((day) => day.stops).find((stop) => stop.placeId === "museum");
    expect(museum).toBeTruthy();
    const withSpare = [
      ...catalog,
      {
        id: "night-market",
        name: "Night Market",
        interest: "markets" as const,
        lat: 47.605,
        lon: -122.325,
        indoor: true,
        openingHours: "Mo-Su 11:00-22:00",
      },
    ];
    const result = reviseByText(original, "swap the City Museum for the Night Market", withSpare, route);
    expect(result.changed).toBe(true);
    const flat = result.itinerary.days.flatMap((day) => day.stops);
    expect(flat.some((stop) => stop.placeId === "museum")).toBe(false);
    expect(flat.some((stop) => stop.placeId === "night-market")).toBe(true);
    const untouched = original.days.flatMap((day) => day.stops).filter((stop) => stop.placeId !== "museum");
    untouched.forEach((stop) => {
      expect(flat.some((next) => next.placeId === stop.placeId)).toBe(true);
    });
  });

  it("refuses a revision it cannot ground and keeps the itinerary", () => {
    const original = buildItinerary({
      request,
      center: { lat: 47.6, lon: -122.33 },
      places: catalog,
      dataSource: "live",
    });
    const result = reviseByText(original, "swap the moon base for a castle", catalog, (a, b) => estimateDrive(a, b));
    expect(result.changed).toBe(false);
    expect(result.itinerary).toEqual(original);
  });

  it("still finds Melrose Market after the museum swap has used Uwajimaya", () => {
    const route = (from: Place, to: Place) => seattleRoute(from, to);
    const sample = buildSeattleSample();
    const proposal = inspectItinerary(sample, SEATTLE_PLACES, route).find((item) => item.reason === "closed");
    expect(proposal).toBeTruthy();
    const swapped = replaceStop(sample, proposal!.stopId, proposal!.replacement, route, SEATTLE_PLACES);
    const result = reviseByText(swapped, "swap Kerry Park for a market", SEATTLE_PLACES, route);
    expect(result.changed).toBe(true);
    expect(result.itinerary.days[0].stops.some((stop) => stop.placeId === "kerry")).toBe(false);
    expect(result.itinerary.days[0].stops.some((stop) => stop.name === "Melrose Market")).toBe(true);
    expect(result.itinerary.days[1]).toEqual(swapped.days[1]);
    expect(result.itinerary.days[2]).toEqual(swapped.days[2]);
  });
});
