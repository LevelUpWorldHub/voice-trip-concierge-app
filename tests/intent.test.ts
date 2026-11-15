import { describe, expect, it } from "vitest";
import { coerceModelIntent, interpretText } from "@/lib/intent";

describe("intent", () => {
  it("reads a full request without asking another question", () => {
    const result = interpretText("Plan 3 days in Seattle for food and parks");
    expect(result.kind).toBe("plan");
    expect(result.missing).toBeNull();
    expect(result.question).toBeNull();
    expect(result.partial).toMatchObject({
      destination: "Seattle",
      days: 3,
      interests: ["food", "parks"],
    });
  });

  it("asks only for the first missing field", () => {
    const first = interpretText("Plan a trip");
    expect(first.kind).toBe("clarify");
    expect(first.missing).toBe("destination");
    expect(first.question).toMatch(/city/i);

    const second = interpretText("Seattle", first.partial, { awaiting: "destination" });
    expect(second.missing).toBe("days");
    expect(second.partial.destination).toBe("Seattle");

    const third = interpretText("3", second.partial, { awaiting: "days" });
    expect(third.missing).toBe("interests");
    expect(third.partial.days).toBe(3);
    expect(third.question).not.toMatch(/city/i);

    const fourth = interpretText("museums", third.partial, { awaiting: "interests" });
    expect(fourth.kind).toBe("plan");
    expect(fourth.partial.interests).toEqual(["museums"]);
  });

  it("treats a swap as a revision once a trip exists", () => {
    const result = interpretText("swap the art museum for a market", { destination: "Seattle", days: 2, interests: ["museums"] }, {
      hasItinerary: true,
    });
    expect(result.kind).toBe("revise");
    expect(result.revisionText).toMatch(/museum/i);
  });

  it("keeps a bad model payload from erasing a local parse", () => {
    const local = interpretText("A weekend of museums in Lisbon");
    const coerced = coerceModelIntent({ kind: "plan", destination: "" }, local);
    expect(coerced.partial.destination).toBe("Lisbon");
    expect(coerced.partial.days).toBe(2);
    expect(coerced.kind).toBe("plan");
  });
});
