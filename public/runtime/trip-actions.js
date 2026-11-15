/** Schemas for site actions the concierge page registers with the browser runtime. */
export const tripActions = [
  {
    name: "website_read_trip_state",
    description: "Read the itinerary currently on the page.",
    effect: "read",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "website_plan_trip",
    description: "Plan a trip from the traveler's words. This updates the page.",
    effect: "write",
    parameters: {
      type: "object",
      properties: { request: { type: "string" } },
      required: ["request"],
    },
  },
  {
    name: "website_revise_stop",
    description: "Change one stop and keep the rest. This updates the page.",
    effect: "write",
    parameters: {
      type: "object",
      properties: { request: { type: "string" } },
      required: ["request"],
    },
  },
  {
    name: "website_propose_swaps",
    description: "List autonomy proposals for closures, weather, and long drives.",
    effect: "read",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "website_apply_swap",
    description: "Apply one pending swap. This updates the page.",
    effect: "write",
    parameters: {
      type: "object",
      properties: { proposalId: { type: "string" } },
      required: ["proposalId"],
    },
  },
];
