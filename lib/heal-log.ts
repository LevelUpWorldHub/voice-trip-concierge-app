/** Copy shown in the Status panel after the labeled Seattle sample is loaded. */

export const SAMPLE_MAP_FALLBACK_LINE =
  "No key required. The labeled Seattle sample replaced a live map call.";

export const SAMPLE_AUTONOMY_LINE =
  "Autonomy watch checked the first day's hours, the next day's rain, and a 46 minute drive locally.";

export const DETERMINISTIC_UNTIL_CONFIG_LINE =
  "Firebase AI Logic stays on the deterministic parser until the web config is set.";

export const FIREBASE_CONFIGURED_MODE_LINE =
  "Firebase AI Logic is configured. Intent and narration prefer on-device Gemini when it is ready, otherwise cloud Gemini.";

/** Status-panel line that reflects whether Firebase web config is present. */
export function sampleFirebaseModeLine(configured: boolean): string {
  return configured ? FIREBASE_CONFIGURED_MODE_LINE : DETERMINISTIC_UNTIL_CONFIG_LINE;
}

export function sampleHealLog(configured: boolean): string[] {
  return [SAMPLE_MAP_FALLBACK_LINE, SAMPLE_AUTONOMY_LINE, sampleFirebaseModeLine(configured)];
}
