import { parseMinutes, weekdayIndex } from "@/lib/time";

const DAY_INDEX: Record<string, number> = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6,
};

export type OpenState = "open" | "closed" | "unknown";

type HoursRule = {
  days: number[];
  ranges: [number, number][];
  off: boolean;
};

function expandDays(start: number, end: number): number[] {
  const days: number[] = [];
  let cursor = start;
  for (let step = 0; step < 7; step += 1) {
    days.push(cursor);
    if (cursor === end) break;
    cursor = (cursor + 1) % 7;
  }
  return days;
}

function parseRule(rule: string): HoursRule | null {
  const days: number[] = [];
  const dayPattern = /\b(Su|Mo|Tu|We|Th|Fr|Sa)(?:\s*-\s*(Su|Mo|Tu|We|Th|Fr|Sa))?/g;
  let match: RegExpExecArray | null;
  while ((match = dayPattern.exec(rule))) {
    const start = DAY_INDEX[match[1]];
    const end = match[2] ? DAY_INDEX[match[2]] : start;
    days.push(...expandDays(start, end));
  }
  const ranges: [number, number][] = [];
  const timePattern = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;
  while ((match = timePattern.exec(rule))) {
    const open = parseMinutes(match[1]);
    const close = parseMinutes(match[2]);
    if (Number.isNaN(open) || Number.isNaN(close) || close <= open) return null;
    ranges.push([open, close]);
  }
  const off = /\boff\b|\bclosed\b/i.test(rule);
  if (!days.length && !ranges.length && !off) return null;
  return {
    days: days.length ? [...new Set(days)] : [0, 1, 2, 3, 4, 5, 6],
    ranges,
    off,
  };
}

export function isOpen(
  openingHours: string | undefined,
  isoDate: string,
  hhmm: string,
): OpenState {
  if (!openingHours || !openingHours.trim()) return "unknown";
  const normalized = openingHours.trim();
  if (/^24\s*\/\s*7$/i.test(normalized) || /^open$/i.test(normalized)) return "open";
  const minute = parseMinutes(hhmm);
  if (Number.isNaN(minute)) return "unknown";
  const rules = normalized
    .split(";")
    .map((part) => parseRule(part.trim()))
    .filter((rule): rule is HoursRule => Boolean(rule));
  if (!rules.length) return "unknown";
  const day = weekdayIndex(isoDate);
  const applicable = rules.filter((rule) => rule.days.includes(day));
  if (!applicable.length) return "closed";
  if (applicable.some((rule) => rule.ranges.some(([open, close]) => minute >= open && minute < close))) {
    return "open";
  }
  if (applicable.some((rule) => rule.off || rule.ranges.length > 0)) return "closed";
  return "unknown";
}
