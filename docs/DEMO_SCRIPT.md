# Demo script

Target length: about 1 minute 45 seconds. Record the desktop browser, with the mic optional. Typing is enough if speech recognition is unavailable. Start from a fresh load so the empty state is visible.

## 0:00–0:12 Title

Show the header: Voice Trip Concierge, Level Up Inc, Mark Yukhimets. Point at the badge. With no Firebase key it says **Deterministic fallback**. If Firebase and Chrome Nano are set up, say you will send one line and the badge will switch to on-device or cloud with a latency.

## 0:12–0:28 Sample with problems already in it

Click **Load Seattle sample**. The timeline shows Pike Place Market, the Seattle Art Museum, and Kerry Park. Say: “This is a labeled sample. Day one is today, so the morning check runs, and the art museum is closed that day.” Point at the morning-check banner.

## 0:28–0:48 One tap

The proposed swap card names an open replacement. Click **Approve swap**. The museum row changes. The other stops stay. The concierge speaks, or the reply appears in the transcript if voice output is off.

## 0:48–1:05 Revise one stop

Type: `swap Kerry Park for a market`. Press Enter. Kerry Park becomes Melrose Market, which is in the sample catalog and not already on the timeline. Day 2 and day 3 do not move. Open the **Map** tab and show the brass markers.

## 1:05–1:22 Watch and status

Open **Watch**. Rain on day 2 and the long drive to Golden Gardens Park are listed if they were not already approved. Open **Status**. Nominatim, Overpass, OSRM, Open-Meteo, and Firebase each have a state. Grok is not listed in this hackathon build. Say that a failed probe does not blank the page.

## 1:22–1:40 Agent network

Open **Agents**. Show the manifest link. Click **Run network** and approve the write dialog. The same itinerary updates. The bring-your-own-key card is hidden unless `NEXT_PUBLIC_ENABLE_EXTRA_AI=true`.

## 1:40–1:50 Close

Say the line: “Firebase AI Logic is the only inference path in this hackathon build. The map, the hours, and the one-tap swap work even with no keys.”

Stop the recording before two minutes.
