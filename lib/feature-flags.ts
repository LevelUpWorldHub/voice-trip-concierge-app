/** Hackathon builds keep model calls on Firebase AI Logic unless this is exactly "true". */
export function extraAiEnabled(flag: string | undefined = process.env.NEXT_PUBLIC_ENABLE_EXTRA_AI): boolean {
  return flag === "true";
}

/** Returns false without invoking `call`. */
export async function runOnlyWhenExtraAiEnabled(
  enabled: boolean,
  call: () => Promise<void>,
): Promise<boolean> {
  if (!enabled) return false;
  await call();
  return true;
}

/** Picks the deterministic router unless extra AI is on and a key is present. */
export async function selectBrowserRouter<T>(options: {
  enabled: boolean;
  hasKey: boolean;
  deterministic: () => T;
  compatible: () => T;
}): Promise<T> {
  let chosen = options.deterministic();
  await runOnlyWhenExtraAiEnabled(options.enabled && options.hasKey, async () => {
    chosen = options.compatible();
  });
  return chosen;
}

export function grokHealthRow(
  enabled: boolean,
  apiKey: string | undefined,
  model: string | undefined,
): { id: string; label: string; status: "idle" | "off"; detail: string } | null {
  if (!enabled) return null;
  return {
    id: "grok",
    label: "Grok city pulse",
    status: apiKey ? "idle" : "off",
    detail: apiKey
      ? `Ready with ${model || "grok-4.7"}. It is not used for planning.`
      : "Off until XAI_API_KEY is set. Planning does not use it.",
  };
}

export function disabledCityPulse() {
  return {
    enabled: false as const,
    notes: [] as { text: string; citations: string[] }[],
    citations: [] as string[],
    reason: "City pulse is disabled. Inference stays on Firebase AI Logic.",
  };
}
