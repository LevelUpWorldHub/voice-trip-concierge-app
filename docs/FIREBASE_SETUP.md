# Firebase setup

Voice Trip Concierge calls Firebase AI Logic in the browser. These steps follow the Firebase console and the hybrid inference guide for web as published on 12 November 2026:

https://firebase.google.com/docs/ai-logic/hybrid/web/get-started

Do not put real keys in git. Copy `.env.example` to `.env.local` and paste the values the console gives you.

## 1. Create the Firebase project

1. Sign in at https://console.firebase.google.com/.
2. Select a project, or create one.
3. If you are creating a project, you can skip Google Analytics. The AI Logic SDK does not require it.
4. Finish the on-screen steps.

## 2. Turn on Firebase AI Logic with the Gemini Developer API

1. In the console, open **AI Services > AI Logic**. The product is sometimes still labeled near **Build > AI Logic**.
2. Click **Get started**.
3. When asked for a Gemini API provider, choose **Gemini Developer API**. That path starts without billing. You can add the Agent Platform Gemini API (formerly Vertex AI) later if you want billing-backed models.
4. Continue until the workflow enables the required APIs.
5. This workflow enforces **Firebase App Check** for AI Logic. Leave it enforced. If the **Security > App Check > APIs** row for Firebase AI Logic says **Unenforced**, enforce it.

## 3. Register the web app

1. From Project settings, add a **Web** app if the AI Logic workflow did not already register one.
2. Copy the config object into `.env.local`:

| Config field | Env var |
| --- | --- |
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `storageBucket` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

The app reads these in `lib/hybrid-ai.ts` and calls `getAI`, `GoogleAIBackend`, and `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE`.

## 4. App Check with reCAPTCHA Enterprise

Production attestation for this web app is reCAPTCHA Enterprise.

1. Open **Security > App Check**.
2. Register the web app with the **reCAPTCHA Enterprise** provider.
3. Copy the reCAPTCHA Enterprise **site key** into `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`.
4. Confirm Firebase AI Logic is enforced on the App Check **APIs** tab.

Do not add `localhost` to the reCAPTCHA allowed domains. Firebase documents that this would let anyone run the app from their own machine.

### Local debug token

1. In `.env.local` set `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN=true`.
2. Run the app, open the browser console, and copy the printed debug token.
3. In **Security > App Check > Apps**, open the app menu and choose **Manage debug tokens**.
4. Register that token.
5. You can paste the registered token into the env var instead of `true`.
6. Remove the debug token before any production deploy. Do not commit it.

## 5. On-device Gemini Nano in Chrome

On-device inference needs Chrome on desktop, version 139 or newer, and Firebase JS SDK 12.5.0 or newer (this app uses the current `firebase` package).

1. Open `chrome://settings/help` and update Chrome.
2. Open `chrome://flags`, set **Gemma 4 for Built-in AI** to **Enabled**, and restart Chrome.
3. Optional, in the console: `await LanguageModel.availability()`. If it prints `downloadable`, run `await LanguageModel.create()` and let the model download.

The concierge calls `initializeDeviceModel()` on the first Send or Speak gesture, then `generateContent()`. `PREFER_ON_DEVICE` uses Gemini Nano when it is ready and otherwise uses the cloud model named by `NEXT_PUBLIC_FIREBASE_CLOUD_MODEL`. The SDK default documented on 12 November 2026 is `gemini-3.5-flash-lite`. The badge reads the response `inferenceSource`: `on_device` or `in_cloud`.

## 6. Deploy on Vercel

1. Import the repository at https://vercel.com/new.
2. Framework preset: Next.js. No extra build command.
3. Add the same env vars in Project Settings. Leave `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` unset in production.
4. Deploy. Add the production domain to the Firebase authorized domains list and to the reCAPTCHA Enterprise key if the provider requires it.

Until those values exist, the app stays in no-key demo mode and does not call Firebase.
