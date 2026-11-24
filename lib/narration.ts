import type { Itinerary, Proposal } from "@/lib/types";

export function narrateItinerary(itinerary: Itinerary): string {
  if (!itinerary.days.length) {
    return `I don't have stops for ${itinerary.destination} yet.`;
  }
  const lines = itinerary.days.map((day) => {
    const names = day.stops.map((stop) => `${stop.name} at ${stop.arrival}`).join(", then ");
    return `Day ${day.day}: ${names}.`;
  });
  const prefix =
    itinerary.sampleLabel && itinerary.sampleStandsIn === false && itinerary.askedFor
      ? `This is not a plan for ${itinerary.askedFor}. ${itinerary.sampleLabel}. The stops are in Seattle. `
      : itinerary.sampleLabel
        ? `${itinerary.sampleLabel}. `
        : `${itinerary.days.length}-day ${itinerary.destination}. `;
  return `${prefix}${lines.join(" ")}`;
}

export function narrateProposal(proposal: Proposal): string {
  return proposal.detail;
}

export function narrateApplied(previousName: string, nextName: string): string {
  return `Done. ${previousName} is now ${nextName}. The rest of the trip is unchanged.`;
}
