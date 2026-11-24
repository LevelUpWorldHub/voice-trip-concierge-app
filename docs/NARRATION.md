# Narration

Read this over `demo/voice-trip-concierge.mp4`. The picture already has burned-in captions, so the upload qualifies in English even if you ship the file as recorded. A voice pass should stay inside the same 3 minute limit. The cuts below follow the caption beats. Pause when the caption is on screen, then keep going.

## 0:00

Voice Trip Concierge. I am not filling in a form. I tell it the city, and it watches the day.

## After the second caption

There is no Firebase project and no xAI key on this machine. The badge says deterministic fallback. The labeled Seattle sample still builds the trip.

## When the proposal appears

The watch already checked Monday's hours. The art museum is closed when I would arrive. It picked a nearby place that is open. I tap once. Only that stop moves.

## After the swap

Pike Place is still first. The later days did not get rearranged.

## While Kerry Park changes

I type one revision: swap Kerry Park for a market. Melrose Market takes that slot. Tuesday and Wednesday stay.

## On the map

The stops and the drive sit on OpenStreetMap. The times on the cards came from the sample's labeled legs.

## On Watch

Two things are still waiting. Tuesday is likely rain on an outdoor stop. The drive out to Golden Gardens is 46 minutes. Neither one changes until I approve it.

## On Status

This is the self-healing panel. A timeout retries, and if the map services stay down the screen keeps the labeled Seattle sample instead of going blank. Firebase is listed as off when its web config is absent. Grok is not offered in this hackathon build.

## On extra model routes

Grok city pulse and the bring-your-own-key router stay off unless `NEXT_PUBLIC_ENABLE_EXTRA_AI=true`. The hackathon build does not call them, and the screen does not offer them. Inference that does run goes through Firebase AI Logic.

## Close

When the Firebase web config is present, that same screen runs intent and narration through Firebase AI Logic: Gemini Nano on this Chrome if it is downloaded, cloud Gemini if it is not. App Check sits in front of that call. The watch, the one tap, and the sample fallback are what a traveler gets either way.
