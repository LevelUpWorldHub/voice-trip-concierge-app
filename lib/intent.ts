import { defaultStartDate } from "@/lib/time";
import { INTERESTS, PACES, type Interest, type Pace, type TripRequest } from "@/lib/types";

export type Slot = "destination" | "days" | "interests";

export type IntentKind = "plan" | "revise" | "clarify" | "approve" | "dismiss" | "chat";

export type Interpretation = {
  kind: IntentKind;
  partial: Partial<TripRequest>;
  missing: Slot | null;
  question: string | null;
  revisionText?: string;
};

const QUESTIONS: Record<Slot, string> = {
  destination: "Which city should I plan?",
  days: "How many days should I plan?",
  interests:
    "What should the days lean toward: food, parks, museums, viewpoints, shopping, nightlife, or markets?",
};

const INTEREST_WORDS: Record<string, Interest> = {
  food: "food",
  eat: "food",
  restaurant: "food",
  restaurants: "food",
  dining: "food",
  cafe: "food",
  cafes: "food",
  park: "parks",
  parks: "parks",
  garden: "parks",
  gardens: "parks",
  outdoors: "parks",
  museum: "museums",
  museums: "museums",
  gallery: "museums",
  galleries: "museums",
  viewpoint: "viewpoints",
  viewpoints: "viewpoints",
  view: "viewpoints",
  views: "viewpoints",
  skyline: "viewpoints",
  shopping: "shopping",
  shops: "shopping",
  shop: "shopping",
  nightlife: "nightlife",
  bars: "nightlife",
  night: "nightlife",
  market: "markets",
  markets: "markets",
};

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function interestsIn(text: string): Interest[] {
  const found = new Set<Interest>();
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    const interest = INTEREST_WORDS[token];
    if (interest) found.add(interest);
  }
  return INTERESTS.filter((interest) => found.has(interest));
}

export function daysIn(text: string): number | undefined {
  if (/\bweekend\b/i.test(text)) return 2;
  if (/\b(a|one)\s+week\b/i.test(text)) return 7;
  const numbered = text.match(/\b(\d+)\s*[- ]?\s*days?\b/i);
  if (numbered) return Math.min(7, Math.max(1, Number(numbered[1])));
  if (/\b(a|one)\s+day\b/i.test(text)) return 1;
  return undefined;
}

export function paceIn(text: string): Pace {
  if (/\bpacked\b|\bbusy\b/i.test(text)) return "packed";
  if (/\brelaxed\b|\bslow\b/i.test(text)) return "relaxed";
  return "balanced";
}

const DESTINATION_STOP =
  "(?:for|with|to|about|around|near|starting|focusing|focused|featuring|including|that|where|in|on|from|during|next|this|over)";
const NOT_A_PLACE = /^(food|parks|museums|a|an|the|day|days|plan|go|visit|travel|spend|explore|see|stay|be|get|me|us|my|our)$/iu;
const DESTINATION_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:in|around|to|visit|visiting)\\s+(\\p{L}[\\p{L}\\p{M}.'\u2019-]*(?:\\s+(?!${DESTINATION_STOP}(?![\\p{L}\\p{M}]))\\p{L}[\\p{L}\\p{M}.'\u2019-]*){0,2})(?=\\s+${DESTINATION_STOP}(?![\\p{L}\\p{M}])|\\s*[,.!?;:()]|\\s*$)`,
  "giu",
);

/** City after in/around/to, stopping before connector words or punctuation. Unicode letters allowed. */
export function destinationIn(text: string): string | undefined {
  for (const match of text.normalize("NFC").matchAll(DESTINATION_PATTERN)) {
    const place = match[1].replace(/[.'\u2019-]+$/u, "").trim();
    if (!place || NOT_A_PLACE.test(place)) continue;
    return titleCase(place);
  }
  return undefined;
}

export function nextMissing(partial: Partial<TripRequest>): Slot | null {
  if (!partial.destination?.trim()) return "destination";
  if (!partial.days) return "days";
  if (!partial.interests?.length) return "interests";
  return null;
}

export function isRevision(text: string): boolean {
  return /\b(swap|replace|change)\b/i.test(text) && /\b(for|with|to)\b/i.test(text);
}

export function isApproval(text: string): boolean {
  return /^(yes|approve|approved|apply|do it|go ahead)\b/i.test(text.trim());
}

export function isDismissal(text: string): boolean {
  return /^(no|keep|dismiss|leave it|skip)\b/i.test(text.trim());
}

function complete(partial: Partial<TripRequest>): TripRequest | null {
  if (!partial.destination || !partial.days || !partial.interests?.length) return null;
  return {
    destination: partial.destination,
    days: partial.days,
    interests: partial.interests,
    pace: partial.pace && PACES.includes(partial.pace) ? partial.pace : "balanced",
    startDate: partial.startDate || defaultStartDate(),
  };
}

export function interpretText(
  text: string,
  partial: Partial<TripRequest> = {},
  options: { hasItinerary?: boolean; awaiting?: Slot | null } = {},
): Interpretation {
  const trimmed = text.trim();
  if (options.hasItinerary && isApproval(trimmed)) {
    return { kind: "approve", partial, missing: null, question: null };
  }
  if (options.hasItinerary && isDismissal(trimmed)) {
    return { kind: "dismiss", partial, missing: null, question: null };
  }
  if (options.hasItinerary && isRevision(trimmed)) {
    return { kind: "revise", partial, missing: null, question: null, revisionText: trimmed };
  }

  const next: Partial<TripRequest> = { ...partial };
  const destination = destinationIn(trimmed);
  const days = daysIn(trimmed);
  const interests = interestsIn(trimmed);
  if (destination) next.destination = destination;
  if (days) next.days = days;
  if (interests.length) next.interests = interests;
  if (/\b(packed|relaxed|slow|busy)\b/i.test(trimmed)) next.pace = paceIn(trimmed);

  if (options.awaiting === "destination" && !next.destination) {
    const bare = trimmed.replace(/[?.!]/g, "").trim();
    if (bare && bare.split(/\s+/).length <= 3 && !/^\d+$/.test(bare)) next.destination = titleCase(bare);
  }
  if (options.awaiting === "days" && !next.days) {
    const lone = trimmed.match(/\b(\d+)\b/);
    if (lone) next.days = Math.min(7, Math.max(1, Number(lone[1])));
  }
  if (options.awaiting === "interests" && !next.interests?.length && interests.length) {
    next.interests = interests;
  }

  const missing = nextMissing(next);
  if (missing) {
    return { kind: "clarify", partial: next, missing, question: QUESTIONS[missing] };
  }
  const request = complete(next);
  if (!request) {
    return { kind: "chat", partial: next, missing: null, question: null };
  }
  return { kind: "plan", partial: request, missing: null, question: null };
}

export function coerceModelIntent(raw: unknown, fallback: Interpretation): Interpretation {
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;
  const partial: Partial<TripRequest> = { ...fallback.partial };
  if (typeof record.destination === "string" && record.destination.trim()) {
    partial.destination = record.destination.trim();
  }
  const days = Number(record.days);
  if (Number.isFinite(days) && days > 0) partial.days = Math.min(7, Math.max(1, Math.round(days)));
  if (Array.isArray(record.interests)) {
    const interests = record.interests.filter((item): item is Interest =>
      typeof item === "string" && (INTERESTS as readonly string[]).includes(item),
    );
    if (interests.length) partial.interests = interests;
  }
  if (typeof record.pace === "string" && (PACES as readonly string[]).includes(record.pace)) {
    partial.pace = record.pace as Pace;
  }
  const kind = typeof record.kind === "string" ? record.kind : fallback.kind;
  if (kind === "revise" && typeof record.target === "string" && typeof record.replacement === "string") {
    return {
      kind: "revise",
      partial,
      missing: null,
      question: null,
      revisionText: `swap the ${record.target} for ${record.replacement}`,
    };
  }
  if (kind === "approve" || kind === "dismiss") {
    return { kind, partial, missing: null, question: null };
  }
  const missing = nextMissing(partial);
  if (missing) {
    const question = typeof record.question === "string" && record.question.trim()
      ? record.question.trim()
      : QUESTIONS[missing];
    return { kind: "clarify", partial, missing, question };
  }
  return { kind: "plan", partial: { ...partial, pace: partial.pace ?? "balanced", startDate: partial.startDate ?? defaultStartDate() }, missing: null, question: null };
}
