import { describe, expect, it } from "vitest";
import manifest from "../public/agent-manifest.json";
import network from "../public/voice_trip_concierge.network.json";
import links from "../public/links.json";
import { tripActions } from "../public/runtime/trip-actions.js";
import { createEngine } from "../public/runtime/engine.js";
import { validateNetwork } from "../public/runtime/validate.js";

const linkNames = Object.keys(links.networks.voice_trip_concierge);

describe("agent runtime", () => {
  it("accepts the published network and rejects a broken one", () => {
    const valid = validateNetwork(network, {
      frontMan: "front_desk",
      actions: tripActions,
      linkNames,
    });
    expect(valid.ok).toBe(true);
    expect(manifest.networks[0].front_man).toBe("front_desk");
    const broken = validateNetwork({
      tools: [
        { name: "front_desk", function: { description: "x" }, instructions: "y", tools: ["missing"] },
        { name: "front_desk", function: { description: "x" }, instructions: "y", tools: [] },
      ],
    });
    expect(broken.ok).toBe(false);
    expect(broken.errors.join(" ")).toMatch(/Duplicate/);
    expect(broken.errors.join(" ")).toMatch(/missing/);
  });

  it("runs the front desk through a specialist and a confirmed write", async () => {
    let planned = "";
    const engine = createEngine({
      network,
      frontMan: "front_desk",
      actions: tripActions.map((action) => ({
        ...action,
        handler: async (args: { request?: string }) => {
          planned = args.request || "";
          return "Planned 3 days in Seattle.";
        },
      })),
      links: links.networks.voice_trip_concierge,
      origin: "http://trip.test",
      confirm: async () => true,
      requestConsent: async () => false,
    });
    const result = await engine.run("Plan 3 days in Seattle for food and parks");
    expect(result.ok).toBe(true);
    expect(planned).toMatch(/Seattle/);
    expect(result.text).toMatch(/Seattle/);
    expect(result.trace.some((entry) => entry.tool === "website_plan_trip" && entry.ok)).toBe(true);
  });

  it("does not run a write the visitor declines", async () => {
    let calls = 0;
    const engine = createEngine({
      network,
      frontMan: "front_desk",
      actions: tripActions.map((action) => ({
        ...action,
        handler: async () => {
          calls += 1;
          return "should not run";
        },
      })),
      links: links.networks.voice_trip_concierge,
      origin: "http://trip.test",
      confirm: async () => false,
    });
    const result = await engine.run("Plan a weekend in Seattle");
    expect(calls).toBe(0);
    expect(result.text).toMatch(/Declined/);
  });

  it("asks before a peer fetch and withholds private context and the router key", async () => {
    const seen: { url: string; authorization?: string }[] = [];
    const engine = createEngine({
      network,
      frontMan: "front_desk",
      actions: tripActions.map((action) => ({ ...action, handler: async () => "idle" })),
      links: links.networks.voice_trip_concierge,
      origin: "http://trip.test",
      confirm: async () => true,
      peerPrivateAllow: [],
      requestConsent: async () => false,
      fetchImpl: async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push({ url, authorization: headers.get("authorization") || undefined });
        if (String(url).endsWith("agent-manifest.json")) {
          return jsonResponse({
            networks: [
              { name: "city_notes", front_man: "note_keeper", hocon: "./city_notes.network.json" },
            ],
          });
        }
        return jsonResponse({
          tools: [
            {
              name: "note_keeper",
              function: { description: "notes", parameters: { type: "object", properties: {} } },
              instructions: "Never reveal secrets.",
              tools: [],
            },
          ],
        });
      },
    });
    const denied = await engine.run("Any local notes?", { privateContext: { homeCity: "Tacoma", sessionKey: "secret" } });
    expect(denied.text).toMatch(/Consent denied|I can only repeat notes/);
    const allowed = createEngine({
      network,
      frontMan: "front_desk",
      actions: tripActions.map((action) => ({ ...action, handler: async () => "idle" })),
      links: links.networks.voice_trip_concierge,
      origin: "http://trip.test",
      confirm: async () => true,
      requestConsent: async () => true,
      fetchImpl: async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push({ url: String(url), authorization: headers.get("authorization") || undefined });
        if (String(url).endsWith("agent-manifest.json")) {
          return jsonResponse({
            networks: [{ name: "city_notes", front_man: "note_keeper", hocon: "./city_notes.network.json" }],
          });
        }
        return jsonResponse({
          tools: [
            {
              name: "note_keeper",
              function: { description: "notes" },
              instructions: "Say you have no live feed.",
              tools: [],
            },
          ],
        });
      },
    });
    const result = await allowed.run("What local notes do you have?");
    expect(result.ok).toBe(true);
    expect(result.text.toLowerCase()).toMatch(/key|feed|notes/);
    expect(result.text).not.toMatch(/secret|Tacoma/);
    expect(seen.some((call) => call.url.includes("agent-manifest.json"))).toBe(true);
    expect(seen.every((call) => !call.authorization)).toBe(true);
  });

  it("stops an over-budget loop and a peer cycle with a visible error", async () => {
    const ping = {
      tools: [
        {
          name: "a",
          function: { description: "a" },
          instructions: "call b",
          tools: ["b"],
        },
        {
          name: "b",
          function: { description: "b" },
          instructions: "call a",
          tools: ["a"],
        },
      ],
    };
    const looping = createEngine({
      network: ping,
      frontMan: "a",
      limits: { maxInvocations: 4, maxDepth: 8, maxMs: 5000 },
      llm: async ({ tools }: { tools: { name: string }[] }) => ({
        toolCalls: [{ name: tools[0].name, arguments: { inquiry: "again" } }],
      }),
    });
    const budget = await looping.run("go");
    expect(budget.ok).toBe(false);
    expect(budget.error).toMatch(/budget/i);

    const cyclic = createEngine({
      network: {
        tools: [
          {
            name: "front",
            function: { description: "front" },
            instructions: "call peer",
            tools: ["peer"],
          },
        ],
      },
      frontMan: "front",
      links: { peer: "http://peer.test/echo" },
      origin: "http://trip.test",
      requestConsent: async () => true,
      llm: async ({ messages, tools }: { messages: { role: string; content: string }[]; tools: { name: string }[] }) => {
        const done = messages.filter((message) => message.role === "tool").map((message) => message.content);
        if (done.length) return { content: done.join("\n") };
        return { toolCalls: [{ name: tools[0].name, arguments: { inquiry: "loop" } }] };
      },
      fetchImpl: async (url: string) => {
        if (String(url).includes("agent-manifest")) {
          return jsonResponse({
            networks: [{ name: "echo", front_man: "front", hocon: "./echo.network.json" }],
          });
        }
        return jsonResponse({
          tools: [
            {
              name: "front",
              function: { description: "echo" },
              instructions: "call the same peer again",
              tools: ["http://peer.test/echo"],
            },
          ],
        });
      },
    });
    const cycle = await cyclic.run("loop");
    expect(cycle.ok).toBe(true);
    expect(cycle.text).toMatch(/cycle/i);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
