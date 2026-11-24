import { inspectItinerary, LONG_LEG_MINUTES, RAIN_PROBABILITY } from "@/lib/autonomy";
import { isOpen, type OpenState } from "@/lib/opening-hours";
import type { RouteFn } from "@/lib/planner";
import type { Itinerary, Place, Proposal } from "@/lib/types";

export const SAVED_TRIP_KEY = "vtc-saved-trip";
export const SAVED_TRIP_VERSION = 1;

export type StopCheck = {
  stopId: string;
  state: OpenState;
  precipProb: number;
  legMinutes: number | null;
};

export type SavedTrip = {
  version: typeof SAVED_TRIP_VERSION;
  itinerary: Itinerary;
  catalog: Place[];
  savedAt: string;
  checks: StopCheck[];
};

export type MorningChange = {
  stopId: string;
  stopName: string;
  detail: string;
  proposal: Proposal | null;
};

export function snapshotChecks(itinerary: Itinerary): StopCheck[] {
  return itinerary.days.flatMap((day) =>
    day.stops.map((stop, index) => ({
      stopId: stop.id,
      state: isOpen(stop.openingHours, day.date, stop.arrival),
      precipProb: day.weather?.precipProb ?? 0,
      legMinutes: index > 0 ? (day.legs[index - 1]?.minutes ?? null) : null,
    })),
  );
}

export function serializeSavedTrip(trip: SavedTrip): string {
  return JSON.stringify(trip);
}

export function parseSavedTrip(raw: string | null): SavedTrip | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedTrip>;
    if (value.version !== SAVED_TRIP_VERSION) return null;
    if (!value.itinerary || !Array.isArray(value.itinerary.days) || value.itinerary.days.length === 0) return null;
    if (!Array.isArray(value.catalog) || !Array.isArray(value.checks)) return null;
    if (typeof value.savedAt !== "string") return null;
    return value as SavedTrip;
  } catch {
    return null;
  }
}

function crossed(before: number, after: number, limit: number): boolean {
  return (before >= limit) !== (after >= limit);
}

export function morningChanges(
  saved: SavedTrip,
  today: string,
  route: RouteFn,
  currentItinerary: Itinerary = saved.itinerary,
): { active: boolean; changes: MorningChange[]; note: string } {
  const onTripDay = saved.itinerary.days.some((day) => day.date === today);
  if (!onTripDay) {
    return {
      active: false,
      changes: [],
      note: "Saved on this device. The morning check runs on a day that is in the trip.",
    };
  }
  const current = snapshotChecks(currentItinerary);
  const proposals = inspectItinerary(currentItinerary, saved.catalog, route);
  const changes: MorningChange[] = [];
  for (const now of current) {
    const before = saved.checks.find((check) => check.stopId === now.stopId);
    if (!before) continue;
    const hoursChanged = before.state !== now.state;
    const rainChanged = crossed(before.precipProb, now.precipProb, RAIN_PROBABILITY);
    const legChanged =
      before.legMinutes != null &&
      now.legMinutes != null &&
      crossed(before.legMinutes, now.legMinutes, LONG_LEG_MINUTES);
    if (!hoursChanged && !rainChanged && !legChanged) continue;
    const stop = saved.itinerary.days.flatMap((day) => day.stops).find((item) => item.id === now.stopId);
    const proposal = proposals.find((item) => item.stopId === now.stopId) ?? null;
    const detail = hoursChanged
      ? `${stop?.name ?? "A stop"} changed from ${before.state} to ${now.state}.`
      : `${stop?.name ?? "A stop"} changed since you saved this trip.`;
    changes.push({
      stopId: now.stopId,
      stopName: stop?.name ?? "A stop",
      detail: proposal ? proposal.detail : detail,
      proposal,
    });
  }
  return {
    active: true,
    changes,
    note: changes.length
      ? "Morning check found a stop that no longer matches what you saved."
      : "Morning check: nothing changed since you saved this trip.",
  };
}
