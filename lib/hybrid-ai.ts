"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
import { coerceModelIntent, type Interpretation } from "@/lib/intent";
import type { Itinerary } from "@/lib/types";

export type InferencePath = "on-device" | "cloud" | "deterministic";

export type HybridTrace = {
  path: InferencePath;
  latencyMs: number;
  detail: string;
};

type Model = ReturnType<typeof getGenerativeModel>;

let app: FirebaseApp | null = null;
let appCheckStarted = false;
let intentModel: Model | null = null;
let narrationModel: Model | null = null;
let deviceKick: Promise<void> | null = null;

export function firebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

function config() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function firebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured()) return null;
  if (app) return app;
  app = getApps()[0] ?? initializeApp(config());
  if (!appCheckStarted && typeof window !== "undefined") {
    appCheckStarted = true;
    const debug = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN;
    if (debug) {
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        debug === "true" ? true : debug;
    }
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
    if (siteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return app;
}

const cloudModel = process.env.NEXT_PUBLIC_FIREBASE_CLOUD_MODEL || "gemini-3.5-flash-lite";

const intentSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["plan", "revise", "clarify", "approve", "dismiss", "chat"] },
    destination: { type: "string" },
    days: { type: "integer" },
    interests: {
      type: "array",
      items: { type: "string", enum: ["food", "parks", "museums", "viewpoints", "shopping", "nightlife", "markets"] },
    },
    pace: { type: "string", enum: ["relaxed", "balanced", "packed"] },
    target: { type: "string" },
    replacement: { type: "string" },
    question: { type: "string" },
  },
  required: ["kind"],
};

function models(): { intent: Model; narration: Model } | null {
  const firebase = firebaseApp();
  if (!firebase) return null;
  if (!intentModel || !narrationModel) {
    const ai = getAI(firebase, { backend: new GoogleAIBackend() });
    intentModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModel,
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: intentSchema,
          maxOutputTokens: 400,
        },
      },
    });
    narrationModel = getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModel,
        generationConfig: { maxOutputTokens: 220 },
      },
    });
  }
  return { intent: intentModel, narration: narrationModel };
}

export function kickDeviceModel(): void {
  const pair = models();
  if (!pair || deviceKick) return;
  deviceKick = pair.intent
    .initializeDeviceModel(() => {})
    .then(() => undefined)
    .catch(() => undefined);
}

function pathFrom(source: string | undefined): InferencePath {
  if (source === "on_device") return "on-device";
  if (source === "in_cloud") return "cloud";
  return "cloud";
}

async function generate(model: Model, prompt: string): Promise<{ text: string; path: InferencePath; latencyMs: number }> {
  const started = performance.now();
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firebase AI Logic timed out")), 20000);
    }),
  ]);
  return {
    text: result.response.text(),
    path: pathFrom(result.response.inferenceSource),
    latencyMs: Math.round(performance.now() - started),
  };
}

export async function interpretWithHybrid(
  text: string,
  fallback: Interpretation,
): Promise<{ interpretation: Interpretation; trace: HybridTrace } | null> {
  const pair = models();
  if (!pair) return null;
  try {
    const known = JSON.stringify({
      destination: fallback.partial.destination || "",
      days: fallback.partial.days || 0,
      interests: fallback.partial.interests || [],
    });
    const prompt = [
      "Parse one traveler message for a trip planner. Return JSON only.",
      "Ask nothing that is already known. kind=revise only when one stop should change.",
      `Known: ${known}`,
      `Message: ${text}`,
    ].join("\n");
    const generated = await generate(pair.intent, prompt);
    const parsed = JSON.parse(generated.text.replace(/^```json\s*|```$/g, "").trim());
    return {
      interpretation: coerceModelIntent(parsed, fallback),
      trace: {
        path: generated.path,
        latencyMs: generated.latencyMs,
        detail: `Intent via Firebase AI Logic (${generated.path}), model hint ${cloudModel}.`,
      },
    };
  } catch (error) {
    return {
      interpretation: fallback,
      trace: {
        path: "deterministic",
        latencyMs: 0,
        detail: `Firebase AI Logic did not answer (${error instanceof Error ? error.message : "error"}). Used the local parser.`,
      },
    };
  }
}

export async function narrateWithHybrid(itinerary: Itinerary, template: string): Promise<{ text: string; trace: HybridTrace }> {
  const pair = models();
  if (!pair) {
    return {
      text: template,
      trace: { path: "deterministic", latencyMs: 0, detail: "Narration template. Firebase web config is not set." },
    };
  }
  try {
    const brief = itinerary.days
      .map((day) => `Day ${day.day}: ${day.stops.map((stop) => `${stop.name} ${stop.arrival}`).join(", ")}`)
      .join(". ");
    const generated = await generate(
      pair.narration,
      `Speak two short sentences a traveler can hear. No markdown. Do not add stops. Plan: ${brief}`,
    );
    return {
      text: generated.text.trim() || template,
      trace: {
        path: generated.path,
        latencyMs: generated.latencyMs,
        detail: `Narration via Firebase AI Logic (${generated.path}).`,
      },
    };
  } catch (error) {
    return {
      text: template,
      trace: {
        path: "deterministic",
        latencyMs: 0,
        detail: `Narration fell back to a template (${error instanceof Error ? error.message : "error"}).`,
      },
    };
  }
}
