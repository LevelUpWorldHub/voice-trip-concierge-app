# Submission notes

Owner: Mark Yukhimets, Level Up Inc.  
Product: Voice Trip Concierge.  
Built during the submission window (first commit 13 November 2026). There is no pre-existing public app to disclose.  
License: Apache-2.0 in `LICENSE` at the repository root.  
Platform to select: **Web / Chrome**.

The app is free, in English, and has no login. Judges can test with zero keys: the badge reads **Deterministic fallback**, and **Load Seattle sample** shows a labeled itinerary with a closure, rain, and a long drive.

## #BuildHybridAI 2026 checklist

Contest: https://firebasehybridaihackathon.devpost.com/  
Rules: https://firebasehybridaihackathon.devpost.com/rules  
Deadline: Monday 30 November 2026, 2:00 PM PT. Target the form for 25–27 November so the final sprint quota window is not the critical path.

| Requirement | Where it is met |
| --- | --- |
| Gen AI app using Firebase AI Logic at runtime | `lib/hybrid-ai.ts` imports `firebase/ai` and calls `getAI`, `GoogleAIBackend`, `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE`, `initializeDeviceModel`, and `generateContent`. The badge reads `inferenceSource` (`on_device` or `in_cloud`) and latency. |
| Web (Chrome), Gemini Nano via Firebase AI Logic | Desktop Chrome 139+ with the Prompt API flag. Cloud model falls back through the same SDK. See `docs/FIREBASE_SETUP.md`. |
| App Check required; debug tokens allowed; secrets not committed | `ReCaptchaEnterpriseProvider` when `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` is set. Debug token env is documented and left empty in git. |
| Open-source license visible at the repo root | `LICENSE` (Apache-2.0, the preferred license). |
| Public GitHub or GitLab repo with source, assets, and run instructions | Public repo: https://github.com/LevelUpWorldHub/voice-trip-concierge-app. It includes the app source, canonical Apache-2.0 `LICENSE` (copyright in `NOTICE`), `docs/PRODUCT_ANALYSIS.md`, and `README.md` run instructions. Add `demo/voice-trip-concierge.mp4` and `app/favicon.ico` from this tree if they are not already on `main`. |
| Text description: Firebase use, features, value | Paste the description below. |
| Demo video, at most 3 minutes, English, shows the product working, public on YouTube | `demo/voice-trip-concierge.mp4` is captions-only and under 3 minutes. Upload it to YouTube (public) and paste the link. Voice-over script: `docs/NARRATION.md`. |
| Testing access, free, no secrets in the instructions | No account. No API key. Open the Vercel URL or `npm run dev`, then **Load Seattle sample**. Do not paste Firebase or xAI keys into the Devpost form. |
| New project during the contest | Built after 11 November 2026. No prior public usage. |

Judging criteria this build is aimed at:

- Technological implementation: hybrid inference is the intent and narration path, with a deterministic fallback so a missing key cannot take the screen down.
- Design: one trip, one watch, one tap. Status, map, and city notes stay on the same page.
- Impact: a traveler hears about a closed museum or a wet park before they are standing in front of it.
- Idea: the model does not invent the stops. Maps, hours, weather, and drive time do. The model explains, and the person approves the change.

### Devpost description (paste)

Voice Trip Concierge is a Web/Chrome trip planner for someone who would rather hear the day than assemble it. You speak or type. Firebase AI Logic reads the request and narrates the plan: Gemini Nano on device in Chrome when it is available, cloud Gemini when it is not. The badge shows which path ran and how long it took. App Check (reCAPTCHA Enterprise, or a debug token locally) protects that call.

The stops themselves come from OpenStreetMap, OSRM, and Open-Meteo. An autonomy watch compares opening hours, rain, and drive length, then proposes one swap. Nothing changes until you tap approve. The other stops stay.

If Firebase is not configured, a deterministic parser and spoken template keep the same flow. If a map service times out, the screen shows a labeled Seattle sample instead of failing. Optional Grok city notes (xAI, `XAI_API_KEY`) add short cited local color and never plan or narrate the trip.

### Still yours before you submit

The public GitHub repo is https://github.com/LevelUpWorldHub/voice-trip-concierge-app. Devpost can use that URL. It includes the canonical Apache-2.0 `LICENSE` (copyright in `NOTICE`) and `docs/PRODUCT_ANALYSIS.md`. Confirm the GitHub About panel shows Apache-2.0.

`demo/voice-trip-concierge.mp4` and `app/favicon.ico` may still need a binary push from a machine signed into GitHub as LevelUpWorldHub (this environment can update text files on that repo, but not git-push binaries as that account):

```bash
git remote add github https://github.com/LevelUpWorldHub/voice-trip-concierge-app.git
git add demo/voice-trip-concierge.mp4 app/favicon.ico
git commit -m "Add demo video and favicon"
git push github main
```

Then:

- Create the Firebase project and fill the env vars in `docs/FIREBASE_SETUP.md`. Confirm the badge can show on-device or cloud on your Chrome.
- Deploy on Vercel from the public repo (env list below) and put that URL in the testing field. Vercel is not connected in this session, so use the Publish button or import the GitHub repo at https://vercel.com/new.
- Upload `demo/voice-trip-concierge.mp4` to YouTube as a public English video. Record a voice pass from `docs/NARRATION.md` if you want narration on top of the burned-in captions. Keep the upload at or under 3 minutes.
- Sign in to Devpost and submit before 30 November 2026, 2:00 PM PT. Select Web/Chrome. Paste the description below, the GitHub URL, the YouTube link, and the Vercel URL.

## Vercel env vars

Set these in the Vercel project. Leave secrets empty if you only need the no-key demo.

- `XAI_API_KEY`
- `XAI_MODEL` (`grok-4.7` if you want the default)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`
- `NEXT_PUBLIC_FIREBASE_CLOUD_MODEL` (`gemini-3.5-flash-lite` unless you choose another current Gemini id)
- `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` — leave unset in production

## Cognizant Open Agentic Web Challenge

Contest: https://cognizant-agenticweb.devpost.com/  
Spec: https://github.com/cognizant-ai-labs/agentic-web/blob/main/docs/worldwide_agentic_web_mvp_spec.md

Published with CORS: `/agent-manifest.json`, `/voice_trip_concierge.network.json`, `/city_notes.network.json`, `/links.json`, `/runtime/index.js`. The Agents tab runs that network in the browser. The default router is deterministic so the host pays nothing. A visitor may save their own OpenAI-compatible key in this browser. That key is not the Firebase inference path and is not required for #BuildHybridAI.

Intent and narration in the main screen go through Firebase AI Logic when configured. The FAQ for #BuildHybridAI asks that model inference go through Firebase AI Logic. Grok is limited to optional cited notes. The agent-network router is the Cognizant bring-your-own-key path, off unless the visitor turns it on.
