import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { destinationIn, interpretText } from "@/lib/intent";
import { isEchoResponse } from "@/lib/hybrid-ai";
import { queryOverpass, readCoordinate, upstreamFailure } from "@/lib/server/overpass";

describe("destination parsing (Wave 1)", () => {
  it.each([
    ["Plan 3 days in Denver for parks", "Denver"],
    ["2 days in Boise for food", "Boise"],
    ["Take me to Boise for food and museums", "Boise"],
    ["Plan a weekend in Kraków for museums", "Kraków"],
    ["3 days in São Paulo with food", "São Paulo"],
    ["A day in Zürich, parks please", "Zürich"],
    ["Plan 2 days in Montréal about markets", "Montréal"],
    ["Plan 3 days in New York City for food", "New York City"],
    ["4 days in Portland starting tomorrow", "Portland"],
    ["Weekend around Austin focusing on nightlife", "Austin"],
    ["Plan a trip to Chicago.", "Chicago"],
  ])("%s -> %s", (text, city) => {
    expect(destinationIn(text)).toBe(city);
  });

  it("does not fall back to Seattle for Denver", () => {
    expect(interpretText("Plan 3 days in Denver for parks").partial.destination).toBe("Denver");
  });

  it("ignores filler words", () => {
    expect(destinationIn("Plan 3 days in parks")).toBeUndefined();
  });
});

describe("echo rejection (Wave 1)", () => {
  const prompt = "Speak two short sentences a traveler can hear. No markdown. Do not add stops. Plan: Day 1: Pike Place 09:00";
  it("rejects an exact echo", () => expect(isEchoResponse(prompt, prompt)).toBe(true));
  it("rejects an echo with extra whitespace or quoting", () => expect(isEchoResponse(prompt, `"${prompt}\n"`)).toBe(true));
  it("rejects replies that repeat our instructions", () =>
    expect(isEchoResponse(prompt, "Speak two short sentences a traveler can hear. Day one starts at Pike Place.")).toBe(true));
  it("rejects empty output", () => expect(isEchoResponse(prompt, "   ")).toBe(true));
  it("accepts a real narration", () =>
    expect(isEchoResponse(prompt, "Day one opens at Pike Place at nine. Bring an umbrella for the afternoon.")).toBe(false));
});

describe("places upstream handling (Wave 1)", () => {
  it("validates coordinates", () => {
    expect(readCoordinate("47.6", "-122.3")).toEqual({ lat: 47.6, lon: -122.3 });
    expect(readCoordinate(null, "1")).toBeNull();
    expect(readCoordinate("91", "0")).toBeNull();
    expect(readCoordinate("abc", "0")).toBeNull();
  });

  it("returns 504 with fallback metadata when every endpoint times out", async () => {
    const result = await queryOverpass("q", async () => ({ ok: false, status: 0, data: null, latencyMs: 5, error: "The operation was aborted due to timeout" }));
    expect(result.elements).toBeNull();
    const response = upstreamFailure(result.error!, result.attempts, result.latencyMs);
    expect(response.status).toBe(504);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, fallback: { reason: "upstream_timeout", retryable: true } });
    expect(body.fallback.attempts).toHaveLength(2);
  });

  it("returns 502 on an upstream HTTP error", async () => {
    const result = await queryOverpass("q", async () => ({ ok: false, status: 429, data: null, latencyMs: 5, error: "HTTP 429" }));
    expect(upstreamFailure(result.error!, result.attempts, result.latencyMs).status).toBe(502);
  });

  it("caps each endpoint timeout and stops at the first good answer", async () => {
    const timeouts: number[] = [];
    const result = await queryOverpass("q", async (_url, _init, timeoutMs) => {
      timeouts.push(timeoutMs!);
      return { ok: true, status: 200, data: { elements: [] }, latencyMs: 1 };
    });
    expect(result.elements).toEqual([]);
    expect(timeouts).toEqual([4000]);
  });
});

describe("security headers (Wave 1)", () => {
  it("sets nosniff, frame and referrer headers for every path", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const all = config.headers.find((rule: { source: string }) => rule.source === "/(.*)");
    const keys = Object.fromEntries(all.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
    expect(keys["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
