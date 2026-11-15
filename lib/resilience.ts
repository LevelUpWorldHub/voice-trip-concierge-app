export type AttemptLog = {
  service: string;
  attempt: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type ResilientSuccess<T> = {
  ok: true;
  value: T;
  source: "live" | "fallback";
  attempts: AttemptLog[];
};

export type ResilientFailure = {
  ok: false;
  attempts: AttemptLog[];
  error: string;
};

export type ResilientResult<T> = ResilientSuccess<T> | ResilientFailure;

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  return await new Promise<T>((resolve, reject) => {
    const fail = () => reject(new Error("timeout"));
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
    Promise.resolve()
      .then(() => task(signal))
      .then(resolve, reject);
  });
}

export async function withResilience<T>(options: {
  service: string;
  task: (signal: AbortSignal, attempt: number) => Promise<T>;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number[];
  fallback?: () => T | Promise<T>;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ResilientResult<T>> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? [200, 600, 1400];
  const sleep = options.sleep ?? defaultSleep;
  const attempts: AttemptLog[] = [];
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const value = await runWithTimeout((signal) => options.task(signal, attempt), timeoutMs);
      attempts.push({ service: options.service, attempt, ok: true, latencyMs: Date.now() - started });
      return { ok: true, value, source: "live", attempts };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request failed";
      attempts.push({
        service: options.service,
        attempt,
        ok: false,
        latencyMs: Date.now() - started,
        error: lastError,
      });
      if (attempt < retries) await sleep(backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0);
    }
  }
  if (options.fallback) {
    const value = await options.fallback();
    return { ok: true, value, source: "fallback", attempts };
  }
  return { ok: false, attempts, error: lastError };
}
