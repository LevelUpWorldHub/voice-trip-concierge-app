import { describe, expect, it } from "vitest";
import {
  DETERMINISTIC_UNTIL_CONFIG_LINE,
  FIREBASE_CONFIGURED_MODE_LINE,
  sampleFirebaseModeLine,
  sampleHealLog,
} from "@/lib/heal-log";

describe("sample Status heal log", () => {
  it("reports the configured Firebase mode when web config is present", () => {
    const lines = sampleHealLog(true);
    expect(lines).toHaveLength(3);
    expect(sampleFirebaseModeLine(true)).toBe(FIREBASE_CONFIGURED_MODE_LINE);
    expect(lines[2]).toBe(FIREBASE_CONFIGURED_MODE_LINE);
    expect(lines.join("\n")).not.toMatch(/deterministic parser until the web config is set/i);
    expect(lines[2]).toMatch(/Firebase AI Logic is configured/i);
    expect(lines[2]).toMatch(/on-device Gemini/i);
    expect(lines[2]).toMatch(/cloud Gemini/i);
  });

  it("keeps the deterministic-parser line when web config is missing (negative path)", () => {
    const lines = sampleHealLog(false);
    expect(sampleFirebaseModeLine(false)).toBe(DETERMINISTIC_UNTIL_CONFIG_LINE);
    expect(lines[2]).toBe(DETERMINISTIC_UNTIL_CONFIG_LINE);
    expect(lines.join("\n")).toMatch(/deterministic parser until the web config is set/);
    expect(lines).not.toContain(FIREBASE_CONFIGURED_MODE_LINE);
  });
});
