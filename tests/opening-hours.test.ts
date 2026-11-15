import { describe, expect, it } from "vitest";
import { isOpen } from "@/lib/opening-hours";

describe("opening hours", () => {
  it("reads a practical subset of OSM opening_hours", () => {
    expect(isOpen("24/7", "2026-11-16", "23:10")).toBe("open");
    expect(isOpen("Mo-Fr 09:00-17:00", "2026-11-16", "10:00")).toBe("open");
    expect(isOpen("Mo-Fr 09:00-17:00", "2026-11-16", "17:00")).toBe("closed");
    expect(isOpen("Mo-Fr 09:00-17:00", "2026-11-21", "10:00")).toBe("closed");
    expect(isOpen("Tu-Su 10:00-17:00", "2026-11-16", "11:00")).toBe("closed");
    expect(isOpen("Tu-Su 10:00-17:00", "2026-11-17", "11:00")).toBe("open");
    expect(isOpen("Mo-Su 09:00-12:00,13:00-17:00", "2026-11-16", "12:30")).toBe("closed");
    expect(isOpen("Mo-Su 09:00-12:00,13:00-17:00", "2026-11-16", "13:15")).toBe("open");
    expect(isOpen("Mo-Sa 10:00-21:00; Su 11:00-19:00", "2026-11-15", "12:00")).toBe("open");
    expect(isOpen(undefined, "2026-11-16", "12:00")).toBe("unknown");
    expect(isOpen("sunrise-sunset", "2026-11-16", "12:00")).toBe("unknown");
  });
});
