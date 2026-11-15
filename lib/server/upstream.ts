import { unstable_rethrow } from "next/navigation";

export const USER_AGENT = "VoiceTripConcierge/1.0 (Level Up Inc; educational hackathon demo)";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export function rethrowIfNeeded(error: unknown): void {
  unstable_rethrow(error);
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      data,
      latencyMs: Date.now() - started,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs: Date.now() - started,
      error: errorMessage(error),
    };
  }
}
