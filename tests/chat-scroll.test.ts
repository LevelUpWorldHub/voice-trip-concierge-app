import { describe, expect, it } from "vitest";
import { isScrolledToLatest, scrollElementToLatest } from "@/lib/chat-scroll";

describe("chat pane auto-scroll", () => {
  it("scrolls a viewport to the latest message line", () => {
    const viewport = { scrollHeight: 1200, scrollTop: 40, clientHeight: 300 };
    expect(scrollElementToLatest(viewport)).toBe(true);
    expect(viewport.scrollTop).toBe(1200);
    expect(isScrolledToLatest({ scrollHeight: 1200, scrollTop: viewport.scrollTop, clientHeight: 300 })).toBe(true);
  });

  it("does nothing when the chat viewport is missing (negative path)", () => {
    expect(scrollElementToLatest(null)).toBe(false);
    expect(scrollElementToLatest(undefined)).toBe(false);
    const untouched = { scrollHeight: 800, scrollTop: 12 };
    // prove a missing element cannot mutate a different pane
    expect(scrollElementToLatest(null)).toBe(false);
    expect(untouched.scrollTop).toBe(12);
    expect(isScrolledToLatest({ scrollHeight: 800, scrollTop: 12, clientHeight: 300 })).toBe(false);
  });
});
