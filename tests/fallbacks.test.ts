import { describe, expect, it } from "vitest";
import { buildSeattleSample, SEATTLE_SAMPLE_LABEL } from "@/lib/seattle";
import { withResilience } from "@/lib/resilience";

describe("fallbacks", () => {
  it("returns a labeled Seattle sample even when the ask was another city", () => {
    const sample = buildSeattleSample(
      { destination: "Lisbon", days: 3, interests: ["food"], pace: "relaxed" },
      "Nominatim timed out",
    );
    expect(sample.dataSource).toBe("snapshot");
    expect(sample.sampleLabel).toBe(SEATTLE_SAMPLE_LABEL);
    expect(sample.destination).toBe("Seattle");
    expect(sample.days.length).toBe(3);
    expect(sample.warnings.join(" ")).toMatch(/Lisbon/);
    expect(sample.warnings.join(" ")).toMatch(/sample/i);
    expect(sample.days.some((day) => day.stops.some((stop) => stop.name === "Pike Place Market"))).toBe(true);
  });
});

describe("resilience", () => {
  it("retries then returns the live value", async () => {
    let calls = 0;
    const result = await withResilience({
      service: "nominatim",
      retries: 3,
      timeoutMs: 200,
      backoffMs: [0, 0, 0],
      sleep: async () => {},
      task: async () => {
        calls += 1;
        if (calls < 3) throw new Error("upstream down");
        return "geocoded";
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("geocoded");
      expect(result.source).toBe("live");
      expect(result.attempts).toHaveLength(3);
    }
  });

  it("uses the fallback after timeouts", async () => {
    const result = await withResilience({
      service: "osrm",
      retries: 2,
      timeoutMs: 30,
      backoffMs: [0],
      sleep: async () => {},
      fallback: () => "sample",
      task: () => new Promise(() => {}),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("fallback");
      expect(result.value).toBe("sample");
      expect(result.attempts.every((attempt) => attempt.error === "timeout")).toBe(true);
    }
  });

  it("reports failure without a fallback and does not throw", async () => {
    const result = await withResilience({
      service: "weather",
      retries: 1,
      timeoutMs: 50,
      task: async () => {
        throw new Error("no forecast");
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no forecast");
  });
});
