# Voice Trip Concierge

Voice Trip Concierge is an autonomous trip planner for the browser. You speak or type. It asks only for the city, the number of days, or the interests it still does not have, then builds a multi-stop itinerary from OpenStreetMap and driving times. If a stop is closed, rained on, or a long drive away, it proposes one swap and waits for a tap.

Built by Mark Yukhimets, Level Up Inc, for Firebase #BuildHybridAI 2026 and the Cognizant Open Agentic Web Challenge.

## Run it

```bash
npm install
npm run dev -- --port 43123
```

Open the printed URL. No API keys are required. Without Firebase or xAI credentials the planner, the Seattle sample, voice input, and spoken templates still work. The inference badge reads **Deterministic fallback**.

```bash
npm test
npm run build
```

## What the screen does

- Voice input uses the Web Speech API. Typing uses the same planner. Replies can be spoken.
- Places come from Nominatim and Overpass. Drive times come from OSRM. Weather comes from Open-Meteo.
- A revision such as “swap the art museum for a market” changes that stop and leaves the rest.
- The watch tab checks opening hours, precipitation, and legs longer than 40 minutes.
- **Load Seattle sample** is a labeled snapshot for demos and for when a live service times out.
- **City pulse** calls Grok only when `XAI_API_KEY` is set. It never plans the trip.
- **Agents** runs the published agent network in the browser. Bring-your-own-key settings stay in `localStorage`.

## Environment

Copy `.env.example` to `.env.local` for local work, or set the same names in Vercel. Leave them blank for the no-key demo. Do not commit real keys. Firebase setup is in `docs/FIREBASE_SETUP.md`.

Vercel env vars:

- `XAI_API_KEY`
- `XAI_MODEL`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`
- `NEXT_PUBLIC_FIREBASE_CLOUD_MODEL`
- `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` (local debug only; leave unset on Vercel)

`vercel.json` marks the project as Next.js and publishes CORS on the agent-network JSON files. `npm run build` is the production build.

## Demo video

`demo/voice-trip-concierge.mp4` is a captions-only screen recording under the #BuildHybridAI 3 minute limit. `docs/NARRATION.md` is the voice-over. Regenerate it with `npm run build` and `npm run demo` (Playwright).

## Contests

- `docs/SUBMISSION.md` is the #BuildHybridAI checklist and the Devpost paste.
- `docs/DEMO_SCRIPT.md` is the shot list.
- `docs/ARCHITECTURE.md` is the system diagram.

Public agent files: `agent-manifest.json`, `voice_trip_concierge.network.json`, `city_notes.network.json`, `links.json`, and `runtime/index.js`.
