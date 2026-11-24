import { describe, expect, it } from "vitest";
import { hoursOpenExcept } from "@/lib/opening-hours";
import { morningChanges, parseSavedTrip, snapshotChecks, type SavedTrip } from "@/lib/saved-trip";
import { buildSeattleSample, seattleRoute } from "@/lib/seattle";
import { weekdayIndex } from "@/lib/time";

function savedFrom(): SavedTrip {
  const itinerary = buildSeattleSample();
  return {
    version: 1,
    itinerary,
    catalog: [],
    savedAt: "2026-11-16T08:00:00.000Z",
    checks: snapshotChecks(itinerary),
  };
}

describe("saved trip morning check", () => {
  it("rejects corrupt, empty, and wrong-version payloads", () => {
    expect(parseSavedTrip(null)).toBeNull();
    expect(parseSavedTrip("")).toBeNull();
    expect(parseSavedTrip("{")).toBeNull();
    expect(parseSavedTrip(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseSavedTrip(JSON.stringify({ version: 1, itinerary: { days: [] }, catalog: [], checks: [], savedAt: "x" }))).toBeNull();
  });

  it("stays quiet on a day that is not in the trip", () => {
    const saved = savedFrom();
    const result = morningChanges(saved, "1999-01-01", seattleRoute);
    expect(result.active).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("reports no change when the morning matches what was saved", () => {
    const saved = savedFrom();
    saved.catalog = [];
    const result = morningChanges(saved, saved.itinerary.days[0].date, seattleRoute, saved.itinerary);
    expect(result.active).toBe(true);
    expect(result.changes).toEqual([]);
    expect(result.note).toMatch(/nothing changed/i);
  });

  it("surfaces a one-tap suggestion when a saved stop is now closed", () => {
    const saved = savedFrom();
    const openReplacement = {
      id: "known",
      name: "Known Gallery",
      interest: "museums" as const,
      lat: 47.608,
      lon: -122.336,
      indoor: true,
      openingHours: "Mo-Su 09:00-18:00",
    };
    saved.catalog = [openReplacement];
    const current = structuredClone(saved.itinerary);
    const market = current.days[0].stops.find((stop) => stop.placeId === "pike-place");
    expect(market).toBeTruthy();
    market!.openingHours = hoursOpenExcept(weekdayIndex(saved.itinerary.days[0].date));
    const result = morningChanges(saved, saved.itinerary.days[0].date, seattleRoute, current);
    expect(result.active).toBe(true);
    expect(result.changes.some((change) => change.stopId === market!.id && change.proposal?.replacement.id === "known")).toBe(true);
  });

  it("does not suggest a swap when the new hours are unknown", () => {
    const saved = savedFrom();
    saved.catalog = [
      {
        id: "blank",
        name: "Blank Hours",
        interest: "museums",
        lat: 47.61,
        lon: -122.33,
        indoor: true,
      },
    ];
    const current = structuredClone(saved.itinerary);
    const market = current.days[0].stops.find((stop) => stop.placeId === "pike-place")!;
    market.openingHours = "sunrise-sunset";
    const result = morningChanges(saved, current.days[0].date, seattleRoute, current);
    const change = result.changes.find((item) => item.stopId === market.id);
    expect(change).toBeTruthy();
    expect(change?.proposal == null || change.proposal.replacement.openingHours).toBeTruthy();
    expect(change?.proposal?.replacement.id).not.toBe("blank");
  });
});
