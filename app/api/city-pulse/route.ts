import { connection } from "next/server";
import { runCityPulse } from "@/lib/city-pulse";
import { extraAiEnabled } from "@/lib/feature-flags";
import { errorMessage, rethrowIfNeeded } from "@/lib/server/upstream";

export async function POST(request: Request) {
  await connection();
  try {
    const body = await request.json().catch(() => null);
    const result = await runCityPulse({
      enabled: extraAiEnabled(),
      apiKey: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL,
      body,
    });
    return Response.json(result);
  } catch (error) {
    rethrowIfNeeded(error);
    return Response.json({
      enabled: false,
      notes: [],
      citations: [],
      reason: errorMessage(error),
    });
  }
}
