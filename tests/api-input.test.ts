import { describe, expect, it } from "vitest";
import { validateCityQuery, validateCoordinate, validateDrivePoints, validatePulseCity } from "@/lib/api-input";

describe("api input validation", () => {
  it("rejects empty, oversized, and punctuated city names", () => {
    expect(validateCityQuery(null).ok).toBe(false);
    expect(validateCityQuery("   ").ok).toBe(false);
    expect(validateCityQuery("a".repeat(121)).ok).toBe(false);
    expect(validateCityQuery("Seattle<script>").ok).toBe(false);
    expect(validateCityQuery("Seattle").ok).toBe(true);
  });

  it("rejects missing and out-of-range coordinates", () => {
    expect(validateCoordinate("nope", "1").ok).toBe(false);
    expect(validateCoordinate(91, 0).ok).toBe(false);
    expect(validateCoordinate(0, 181).ok).toBe(false);
    expect(validateCoordinate(-90, -180).ok).toBe(true);
  });

  it("rejects drive bodies that are not two to eight finite points", () => {
    expect(validateDrivePoints(null).ok).toBe(false);
    expect(validateDrivePoints({}).ok).toBe(false);
    expect(validateDrivePoints({ points: [{ lat: 1, lon: 2 }] }).ok).toBe(false);
    expect(validateDrivePoints({ points: [{ lat: "x", lon: 2 }, { lat: 1, lon: 2 }] }).ok).toBe(false);
    const tooMany = { points: Array.from({ length: 9 }, () => ({ lat: 1, lon: 2 })) };
    expect(validateDrivePoints(tooMany).ok).toBe(false);
    expect(validateDrivePoints({ points: [{ lat: 47.6, lon: -122.3 }, { lat: 47.61, lon: -122.31 }] }).ok).toBe(true);
  });

  it("rejects a city pulse with no usable city", () => {
    expect(validatePulseCity(null).ok).toBe(false);
    expect(validatePulseCity({}).ok).toBe(false);
    expect(validatePulseCity({ city: "!!!" }).ok).toBe(false);
    expect(validatePulseCity({ city: "  Lisbon " }).ok).toBe(true);
  });
});
