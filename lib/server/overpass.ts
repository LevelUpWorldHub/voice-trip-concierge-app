import { fetchJson } from "@/lib/server/upstream";

export const OVERPASS_ENDPOINTS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/** Per-endpoint cap and total budget. Both stay under the 9s client timeout in lib/plan-client.ts. */
export const ENDPOINT_TIMEOUT_MS = 4000;
export const TOTAL_BUDGET_MS = 8000;

export type Attempt = { endpoint: string; status: number; error?: string; latencyMs: number; timedOut: boolean };

export function readCoordinate(latRaw: string | null, lonRaw: string | null): { lat: number; lon: number } | null {
  if (latRaw == null || lonRaw == null || latRaw.trim() === "" || lonRaw.trim() === "") return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function isTimeout(error: string | undefined): boolean {
  return /timeout|timed out|aborted/i.test(error || "");
}

/** Structured failure: 504 when every upstream timed out, 502 otherwise. */
export function upstreamFailure(error: string, attempts: Attempt[], latencyMs: number): Response {
  const allTimedOut = attempts.length > 0 && attempts.every((attempt) => attempt.timedOut);
  return Response.json(
    {
      ok: false,
      error,
      latencyMs,
      fallback: {
        used: "client-sample",
        reason: allTimedOut ? "upstream_timeout" : "upstream_error",
        retryable: true,
        attempts,
      },
    },
    { status: allTimedOut ? 504 : 502, headers: { "Cache-Control": "no-store" } },
  );
}

export async function queryOverpass(
  query: string,
  fetcher: typeof fetchJson = fetchJson,
  endpoints: readonly string[] = OVERPASS_ENDPOINTS,
): Promise<{ elements: unknown[] | null; attempts: Attempt[]; latencyMs: number; error?: string }> {
  const started = Date.now();
  const attempts: Attempt[] = [];
  for (const endpoint of endpoints) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - started);
    if (remaining < 500) break;
    const attempt = await fetcher(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
      },
      Math.min(ENDPOINT_TIMEOUT_MS, remaining),
    );
    const elements = (attempt.data as { elements?: unknown[] } | null)?.elements;
    attempts.push({
      endpoint: new URL(endpoint).host,
      status: attempt.status,
      error: attempt.ok && Array.isArray(elements) ? undefined : attempt.error || "No elements in response",
      latencyMs: attempt.latencyMs,
      timedOut: !attempt.ok && attempt.status === 0 && isTimeout(attempt.error),
    });
    if (attempt.ok && Array.isArray(elements)) return { elements, attempts, latencyMs: Date.now() - started };
  }
  return {
    elements: null,
    attempts,
    latencyMs: Date.now() - started,
    error: attempts.at(-1)?.error || "Places were unavailable.",
  };
}

