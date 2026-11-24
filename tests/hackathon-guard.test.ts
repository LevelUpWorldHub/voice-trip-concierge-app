import { describe, expect, it, vi } from "vitest";
import { runCityPulse } from "@/lib/city-pulse";
import { extraAiEnabled, grokHealthRow, runOnlyWhenExtraAiEnabled, selectBrowserRouter } from "@/lib/feature-flags";

describe("extra AI flag", () => {
  it("is on only for the exact string true", () => {
    expect(extraAiEnabled(undefined)).toBe(false);
    expect(extraAiEnabled("")).toBe(false);
    expect(extraAiEnabled("false")).toBe(false);
    expect(extraAiEnabled("TRUE")).toBe(false);
    expect(extraAiEnabled("true")).toBe(true);
  });

  it("does not call the guarded function when the flag is off", async () => {
    const call = vi.fn(async () => undefined);
    expect(await runOnlyWhenExtraAiEnabled(false, call)).toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(await runOnlyWhenExtraAiEnabled(true, call)).toBe(true);
    expect(call).toHaveBeenCalledOnce();
  });

  it("does not construct the OpenAI-compatible router when extra AI is off", async () => {
    const deterministic = vi.fn(() => "local");
    const compatible = vi.fn(() => "byok");
    const chosen = await selectBrowserRouter({
      enabled: false,
      hasKey: true,
      deterministic,
      compatible,
    });
    expect(chosen).toBe("local");
    expect(deterministic).toHaveBeenCalledOnce();
    expect(compatible).not.toHaveBeenCalled();
  });

  it("constructs the OpenAI-compatible router only when the flag and a key are both set", async () => {
    const compatible = vi.fn(() => "byok");
    const missingKey = await selectBrowserRouter({
      enabled: true,
      hasKey: false,
      deterministic: () => "local",
      compatible,
    });
    expect(missingKey).toBe("local");
    expect(compatible).not.toHaveBeenCalled();
    const chosen = await selectBrowserRouter({
      enabled: true,
      hasKey: true,
      deterministic: () => "local",
      compatible,
    });
    expect(chosen).toBe("byok");
    expect(compatible).toHaveBeenCalledOnce();
  });

  it("omits the Grok health row when extra AI is off", () => {
    expect(grokHealthRow(false, "secret", "grok-4.7")).toBeNull();
    expect(grokHealthRow(true, undefined, undefined)?.status).toBe("off");
  });
});

describe("city pulse route", () => {
  it("does not call xAI when the flag is off, even if a key is present", async () => {
    const fetchImpl = vi.fn();
    const result = await runCityPulse({
      enabled: false,
      apiKey: "secret",
      body: { city: "Seattle" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toMatch(/Firebase AI Logic/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call xAI when the flag is on but the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await runCityPulse({
      enabled: true,
      apiKey: "",
      body: { city: "Seattle" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.enabled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls xAI only when the flag and the key are both set", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 }));
    const result = await runCityPulse({
      enabled: true,
      apiKey: "secret",
      body: { city: "Seattle" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.x.ai/v1/responses");
    expect(result.enabled).toBe(true);
  });
});
