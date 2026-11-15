import { describe, expect, it } from "vitest";
import { buildItinerary } from "@/lib/planner";
import { estimateDrive } from "@/lib/geo";
import type { Place, TripRequest } from "@/lib/types";

function place(id: string, interest: Place["interest"], lon: number, lat = 47.6): Place {
  return {
    id,
    name: id,
    interest,
    lat,
    lon,
    indoor: interest !== "parks" && interest !== "viewpoints",
    openingHours: "Mo-Su 08:00-20:00",
  };
}

const places: Place[] = [
  place("cafe-a", "food", -122.4, 47.61),
  place("cafe-b", "food", -122.35, 47.6),
  place("cafe-c", "food", -122.3, 47.62),
  place("park-a", "parks", -122.39, 47.63),
  place("park-b", "parks", -122.33, 47.59),
  place("park-c", "parks", -122.28, 47.64),
  place("museum-a", "museums", -122.38, 47.6),
  place("museum-b", "museums", -122.32, 47.61),
  place("museum-c", "museums", -122.27, 47.6),
  place("view-a", "viewpoints", -122.37, 47.65),
  place("shop-a", "shopping", -122.31, 47.58),
  place("market-a", "markets", -122.36, 47.6),
];

const request: TripRequest = {
  destination: "Seattle",
  days: 3,
  interests: ["food", "parks", "museums"],
  pace: "balanced",
  startDate: "2026-11-16",
};

describe("planner", () => {
  it("builds a multi-day multi-stop itinerary with advancing times", () => {
    const itinerary = buildItinerary({
      request,
      center: { lat: 47.6, lon: -122.33 },
      places,
      route: (from, to) => ({ ...estimateDrive(from, to), source: "estimate" }),
      dataSource: "live",
    });
    expect(itinerary.days.length).toBe(3);
    const ids = new Set<string>();
    for (const day of itinerary.days) {
      expect(day.stops.length).toBeGreaterThan(1);
      expect(day.legs).toHaveLength(day.stops.length - 1);
      day.stops.forEach((stop, index) => {
        expect(ids.has(stop.id)).toBe(false);
        ids.add(stop.id);
        expect(stop.arrival < stop.depart).toBe(true);
        if (index > 0) expect(stop.arrival >= day.stops[index - 1].depart).toBe(true);
      });
    }
  });

  it("keeps only requested interests when enough places exist", () => {
    const foodOnly = buildItinerary({
      request: { ...request, days: 1, interests: ["food"], pace: "relaxed" },
      center: { lat: 47.6, lon: -122.33 },
      places,
      dataSource: "live",
    });
    expect(foodOnly.days[0].stops.every((stop) => stop.interest === "food")).toBe(true);
    expect(foodOnly.days[0].stops.length).toBeGreaterThan(0);
  });
});
