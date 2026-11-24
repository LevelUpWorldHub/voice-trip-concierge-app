import { describe, expect, it } from "vitest";
import { inspectItinerary, LONG_LEG_MINUTES } from "@/lib/autonomy";
import { replaceStop } from "@/lib/revisions";
import { seattleRoute, SEATTLE_PLACES, buildSeattleSample } from "@/lib/seattle";
import type { Place } from "@/lib/types";

describe("autonomy", () => {
  it("flags a closed stop, a wet outdoor stop, and a long drive", () => {
    const sample = buildSeattleSample();
    const proposals = inspectItinerary(sample, SEATTLE_PLACES, (from, to) => seattleRoute(from, to));
    expect(proposals.map((proposal) => proposal.reason).sort()).toEqual(["closed", "long-leg", "weather"]);
    const closed = proposals.find((proposal) => proposal.reason === "closed")!;
    expect(closed.detail).toMatch(/Seattle Art Museum/);
    expect(closed.replacement.id).not.toBe("sam");
    const weather = proposals.find((proposal) => proposal.reason === "weather")!;
    expect(weather.replacement.indoor).toBe(true);
    const leg = proposals.find((proposal) => proposal.reason === "long-leg")!;
    expect(leg.detail).toMatch(new RegExp(String(LONG_LEG_MINUTES)));
    expect(leg.replacement.id).not.toBe("golden-gardens");
  });

  it("applies one proposal without moving the other stops", () => {
    const sample = buildSeattleSample();
    const proposals = inspectItinerary(sample, SEATTLE_PLACES, (from, to) => seattleRoute(from, to));
    const proposal = proposals[0];
    const beforeIds = sample.days.flatMap((day) => day.stops.map((stop) => stop.placeId));
    const next = replaceStop(sample, proposal.stopId, proposal.replacement, (from, to) => seattleRoute(from, to), SEATTLE_PLACES);
    const afterIds = next.days.flatMap((day) => day.stops.map((stop) => stop.placeId));
    expect(afterIds).toContain(proposal.replacement.id);
    expect(afterIds).not.toContain(beforeIds[beforeIds.indexOf(sample.days.flatMap((day) => day.stops).find((stop) => stop.id === proposal.stopId)!.placeId)]);
    const changed = sample.days.flatMap((day) => day.stops).find((stop) => stop.id === proposal.stopId)!;
    beforeIds.filter((id) => id !== changed.placeId).forEach((id) => {
      expect(afterIds).toContain(id);
    });
  });
});

describe("opening hours used by the watch", () => {
  it("does not propose a swap for a place that is open", () => {
    const openPlace: Place = {
      id: "always",
      name: "All Day Hall",
      interest: "museums",
      lat: 47.61,
      lon: -122.33,
      indoor: true,
      openingHours: "24/7",
    };
    const sample = buildSeattleSample();
    const only = {
      ...sample,
      days: [
        {
          ...sample.days[0],
          weather: { summary: "Clear", tempC: 14, precipProb: 0, code: 0 },
          stops: [
            {
              ...sample.days[0].stops[0],
              ...openPlace,
              placeId: openPlace.id,
              id: "always-d1",
              arrival: "10:00",
              depart: "11:00",
            },
          ],
          legs: [],
        },
      ],
    };
    expect(inspectItinerary(only, [openPlace], () => ({ minutes: 5, meters: 400, source: "estimate" }))).toEqual([]);
  });

  it("does not treat unknown hours as open, and will not swap to an unconfirmed place", () => {
    const sample = buildSeattleSample();
    const unknown: Place = {
      id: "mystery",
      name: "Mystery Hall",
      interest: "museums",
      lat: 47.608,
      lon: -122.337,
      indoor: true,
    };
    const closed = sample.days[0].stops.find((stop) => stop.placeId === "sam")!;
    const onlyUnknown = {
      ...sample,
      days: [{ ...sample.days[0], stops: [closed], legs: [] }],
    };
    expect(inspectItinerary(onlyUnknown, [unknown], () => ({ minutes: 5, meters: 400, source: "estimate" }))).toEqual([]);

    const withKnownOpen: Place = {
      id: "known",
      name: "Known Gallery",
      interest: "museums",
      lat: 47.608,
      lon: -122.336,
      indoor: true,
      openingHours: "Mo-Su 09:00-18:00",
    };
    const unknownStop = { ...closed, id: "mystery-d1", placeId: "mystery", name: "Mystery Hall", openingHours: undefined };
    const unknownDay = {
      ...sample,
      days: [{ ...sample.days[0], weather: { summary: "Clear", tempC: 12, precipProb: 0, code: 0 }, stops: [unknownStop], legs: [] }],
    };
    const proposals = inspectItinerary(unknownDay, [unknown, withKnownOpen], () => ({ minutes: 5, meters: 400, source: "estimate" }));
    expect(proposals).toHaveLength(1);
    expect(proposals[0].reason).toBe("unknown-hours");
    expect(proposals[0].replacement.id).toBe("known");
    expect(proposals[0].detail).toMatch(/not treated as open/);
  });
});
