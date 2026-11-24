import { validatePulseCity } from "@/lib/api-input";
import { disabledCityPulse, runOnlyWhenExtraAiEnabled } from "@/lib/feature-flags";

type Note = { text: string; citations: string[] };

export type CityPulseResult = {
  enabled: boolean;
  notes: Note[];
  citations: string[];
  reason: string;
  model?: string;
};

export async function runCityPulse(options: {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  body: unknown;
  fetchImpl?: typeof fetch;
}): Promise<CityPulseResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!options.enabled) return disabledCityPulse();
  const apiKey = options.apiKey;
  const model = options.model || "grok-4.7";
  if (!apiKey) {
    return {
      enabled: false,
      notes: [],
      citations: [],
      reason: "Grok city pulse is off until XAI_API_KEY is set. Planning does not use it.",
    };
  }
  const parsed = validatePulseCity(options.body);
  if (!parsed.ok) return { enabled: false, notes: [], citations: [], reason: parsed.error };

  const box: { upstream: Response | null } = { upstream: null };
  const allowed = await runOnlyWhenExtraAiEnabled(options.enabled, async () => {
    box.upstream = await fetchImpl("https://api.x.ai/v1/responses", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: `Give a traveler two or three short, current notes about ${parsed.value}. Use web search and X search. Do not invent sources.`,
        tools: [{ type: "web_search" }, { type: "x_search" }],
      }),
    });
  });
  const upstream = box.upstream;
  if (!allowed || !upstream) return disabledCityPulse();

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message =
      (payload as { error?: { message?: string } } | null)?.error?.message ||
      `xAI returned ${upstream.status}`;
    return { enabled: true, notes: [], citations: [], reason: message };
  }
  const texts: string[] = [];
  const urls = new Set<string>();
  collectTextAndUrls(payload, texts, urls);
  const citations = [...urls].slice(0, 6);
  const sentences = texts
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40)
    .slice(0, 3);
  const notes: Note[] = sentences.map((text) => ({ text, citations }));
  return {
    enabled: true,
    model,
    notes,
    citations,
    reason: notes.length ? "" : "Grok answered without a usable note.",
  };
}

function collectTextAndUrls(value: unknown, texts: string[], urls: Set<string>, depth = 0): void {
  if (!value || depth > 8) return;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextAndUrls(item, texts, urls, depth + 1));
    return;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string" && (record.type === "output_text" || record.type === "text")) {
      texts.push(record.text);
    }
    if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) urls.add(record.url);
    for (const child of Object.values(record)) collectTextAndUrls(child, texts, urls, depth + 1);
  }
}
