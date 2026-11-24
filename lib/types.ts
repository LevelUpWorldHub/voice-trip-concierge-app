export const INTERESTS = [
  "food",
  "parks",
  "museums",
  "viewpoints",
  "shopping",
  "nightlife",
  "markets",
] as const;

export type Interest = (typeof INTERESTS)[number];

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export type TripRequest = {
  destination: string;
  days: number;
  interests: Interest[];
  pace: Pace;
  startDate: string;
};

export type Place = {
  id: string;
  name: string;
  interest: Interest;
  lat: number;
  lon: number;
  indoor: boolean;
  openingHours?: string;
  address?: string;
};

export type RouteSource = "osrm" | "estimate" | "snapshot";

export type RouteLeg = {
  minutes: number;
  meters: number;
  source: RouteSource;
};

export type Stop = {
  id: string;
  placeId: string;
  name: string;
  interest: Interest;
  lat: number;
  lon: number;
  indoor: boolean;
  openingHours?: string;
  address?: string;
  day: number;
  arrival: string;
  depart: string;
  dwellMinutes: number;
};

export type Leg = {
  fromId: string;
  toId: string;
  minutes: number;
  meters: number;
  source: RouteSource;
};

export type WeatherDay = {
  summary: string;
  tempC: number;
  precipProb: number;
  code: number;
};

export type DayPlan = {
  day: number;
  date: string;
  title: string;
  stops: Stop[];
  legs: Leg[];
  weather?: WeatherDay;
  geometry: [number, number][];
};

export type Itinerary = {
  id: string;
  destination: string;
  center: { lat: number; lon: number };
  request: TripRequest;
  days: DayPlan[];
  dataSource: "live" | "snapshot";
  sampleLabel?: string;
  /** City the traveler asked for. Present on the Seattle sample. */
  askedFor?: string;
  /** True only when the sample is actually for the city they asked for. */
  sampleStandsIn?: boolean;
  warnings: string[];
};

export type ProposalReason = "closed" | "weather" | "long-leg" | "unknown-hours";

export type Proposal = {
  id: string;
  stopId: string;
  day: number;
  reason: ProposalReason;
  detail: string;
  replacement: Place;
};

export type ServiceHealth = {
  id: string;
  label: string;
  status: "ok" | "degraded" | "down" | "off" | "idle";
  latencyMs?: number;
  detail: string;
};

export type Point = { lat: number; lon: number; id?: string };
