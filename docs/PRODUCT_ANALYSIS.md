# Product analysis

Voice Trip Concierge, as built in this repository. This is a reading of the code and docs, not a proposal to start building. Mark approves before any of the later work.

Sources checked on 19 November 2026. Numbers below are quoted from those pages, not measured by us.

- Priceline / Harris Poll, January 2024, 3,024 U.S. adults: planning and booking a trip takes about 16 hours; 22% name creating the itinerary as one of the most frustrating parts. https://press.priceline.com/new-priceline-research-finds-average-traveler-spends-two-full-work-days-to-plan-and-book-trips/
- Go City / Talker Research, December 2024, 2,000 U.S. frequent travelers: average planning time 17 hours 42 minutes; planning is a pain point for 23%; researching experiences is the single most time-consuming planning activity. https://newsroom.gocity.com/2024-12-12-Travelers-Underutilize-Technology-When-Trip-Planning,-Missing-Opportunities-to-Save-Time-and-Money-According-to-Go-City-Consumer-Survey
- SEO Travel, reported by Travel Weekly: 100 ChatGPT city itineraries, 90% had at least one error; 52% suggested a visit outside opening hours; 24% named a closed venue. https://travelweekly.co.uk/in-depth/survey-finds-chatgpt-itineraries-to-be-riddled-with-inaccuracies
- BBC Travel, 26 September 2025: a couple followed a ChatGPT hike plan and found the descent already closed. A cited 2024 survey said about 33% of AI-planning users had seen false information. https://www.bbc.com/travel/article/20250926-the-perils-of-letting-ai-plan-your-next-trip
- HuffPost, July 2025: an AI weekend plan sent the writer across a city, called long walks short, and ended an activity as a flight was departing. https://www.huffpost.com/entry/chatgpt-travel-plans-itinerary-trip_l_687107c9e4b00de383c0cf1f
- Klook, 2026, 2,725 travelers in 10 markets: more than 7 in 10 planners spend over 10 hours on one group trip; more than half still check their phone six or more times a day during the trip. https://www.klook.com/newsroom/travel-planner-survey-2026/
- Huvver, on weather changes: a rainy-day swap to a museum still has to respect that museum's closed day. The Louvre's regular closure is Tuesday. https://huvver.com/blog/replan-trip-bad-weather
- OpenStreetMap `opening_hours` is a large syntax. This app implements only a subset. https://wiki.openstreetmap.org/wiki/Key:opening_hours

## 1. Who it is for

**Primary user.** A person planning one to seven days in a city, who would rather say the plan than assemble it, and who is the one who gets blamed if the museum is shut. Klook's survey describes that person: the friend who organizes the trip and stays on duty after everyone else has arrived.

**Secondary users.** Someone who prefers speech to typing, within the limits of the Web Speech API in Chrome. Contest judges, who need a free English demo with no login. A second site that loads the published agent network. None of these is the person the product should be optimized for.

**Affected, but not users.** People named on the itinerary who never asked for it. Venues whose OpenStreetMap record is missing, stale, or wrong, and who may get a visitor or lose one. Volunteer map and routing services (Nominatim, Overpass, OSRM) that absorb the lookups. Businesses the planner never ranks, so a famous place and an empty cafe can look the same. Travel advisors, only if someone treats this as a booking agent. It does not book.

## 2. Purpose

Help one traveler keep a city day honest: build the stops from map data, say when hours, rain, or a long drive break the plan, and change only the stop they approve.

## 3. Problems, ranked

1. **A plan that sends you somewhere shut, imaginary, or impossible to reach in time.** SEO Travel found errors in 90% of sampled ChatGPT itineraries, including closed venues and visits outside hours. The BBC reported people stranded by a wrong closing time. HuffPost reported cross-town "short walks" and a schedule that collided with a flight. This is the pain the product is actually shaped for.
2. **The hours spent turning "food and parks" into a day.** Priceline's 16 hours and Go City's 17 hours 42 minutes include booking and price comparison, which this app does not do. The slice it can touch is assembling the experiences. Go City says that research is the most time-consuming planning task. Priceline says 22% already find the itinerary itself frustrating.
3. **The day changes after the plan is written.** Rain, a closed indoor backup, or a drive that eats the afternoon. Huvver's Louvre example is the shape of the bug: an indoor swap can still land on a closed day.
4. **Fixing one mistake rebuilds the whole trip.** HuffPost's account is a schedule that does not survive a single correction. Group travelers then hear "why didn't we do this instead?" (Klook).
5. **The planner stays on duty during the trip.** Klook says more than half of planners check their phone six or more times a day for logistics. The live app can save the trip on this device and, on a day that is in the trip, run a morning check for hours, rain, and long drives. A swap still waits for a tap.

Overspending is the top pain in the Go City survey (44%). This product does not touch price, lodging, or tickets. Treating it as a money-saving tool would be a false promise.

## 4. What the code does today, and where it falls short

### Backend

`app/api/geocode`, `places`, `drive`, and `weather` proxy Nominatim, Overpass, OSRM driving, and Open-Meteo with a named User-Agent, timeouts, and JSON errors instead of a crash. `lib/plan-client.ts` retries, then:

- geocode or places failure replaces the whole trip with the labeled Seattle sample, even if the person asked for another city
- a weather failure keeps the places and pauses rain checks
- an OSRM failure keeps the places and labels legs as estimates

`app/api/city-pulse` calls xAI only when `NEXT_PUBLIC_ENABLE_EXTRA_AI` is exactly `true` and `XAI_API_KEY` is set. It asks for short notes and returns citations it can find. It does not plan. The live site leaves that flag unset, so the route does not call xAI. Planning runs on Firebase AI Logic (Gemini, on device or in the cloud) or the deterministic parser. `app/api/health` probes the map services and omits Grok unless the same flag is on.

Shortfalls: driving only; the first 24 named nodes, not a judgment of what is worth seeing; `opening_hours` only when the tag exists; no prices, tickets, reservations, holidays, or "last boat home". If live map data is missing, the screen uses the labeled Seattle sample and says it is not a plan for a different city the traveler asked for.

### Planner, watch, and speech (inner components)

`lib/intent.ts` asks for the first missing piece only: city, days, or an interest from a fixed list. Pace is relaxed, balanced, or packed. `lib/planner.ts` clusters by longitude, mixes interests, orders by nearest neighbor, and schedules from 10:00 with fixed dwell times. `lib/revisions.ts` replaces one stop and reschedules that day. `lib/autonomy.ts` proposes a swap when a stop is closed, outdoor with at least a 55% chance of precipitation, or a drive over 40 minutes, and only from places already gathered within 8 km. `lib/opening-hours.ts` reads `24/7`, day ranges, and simple hour ranges. Anything else, including `sunrise-sunset`, is `unknown`, and unknown is treated as acceptable. Indoor versus outdoor is the interest category, not an OSM indoor tag. `lib/hybrid-ai.ts` uses Firebase AI Logic in `PREFER_ON_DEVICE` mode for one-turn intent JSON and a short narration. On failure, or with no Firebase web config, `lib/intent.ts` and `lib/narration.ts` take over. `lib/speech.ts` listens and speaks in `en-US` only. `lib/resilience.ts` is the timeout and retry helper. Tests cover these paths without calling the network.

Shortfalls: no memory of who is traveling; hours syntax is a subset of OSM; a closed place with no nearby substitute produces no proposal; the model never sees tools, so it cannot be the thing that verifies hours. A saved trip and the morning check are in the live app (`lib/saved-trip.ts`). Unknown hours are named on the card and can propose a swap.

### Frontend

`components/concierge-app.tsx` is the product: conversation, one-tap approval, timeline, map tab, watch tab, status tab, save on this device, and the morning check. The Grok city-pulse card and the bring-your-own-key form render only when `NEXT_PUBLIC_ENABLE_EXTRA_AI` is `true`. The live site leaves that flag unset. `components/trip-map.tsx` and `map-canvas.tsx` draw the day on OpenStreetMap tiles. `components/error-boundary.tsx` catches a render crash. `components/agent-panel.tsx` runs the public agent network on the deterministic router, asks before a peer fetch, and confirms writes.

The screen tells the truth about the sample and about Grok being off. It can save the trip in this browser. It does not name the people in the party, or distinguish "I am researching" from "I am leaving now."

## 5. The message

**To the traveler.** You stay in charge. The app may notice a closed door, rain, or a long drive. It changes a stop only after a tap. The other stops stay.

**To judges.** Hybrid inference is for understanding and speaking, not for inventing the map. On-device when Chrome has Gemini Nano, cloud Gemini otherwise, and a deterministic parser when Firebase is absent. That last path is what the current demo video shows, because no Firebase project is configured in this repo.

**To the public.** Autonomy here means a narrow watch with a person at the switch. It is not a claim that an assistant should book, spend, or wander the web on someone's behalf. Planning is Firebase AI Logic or the deterministic parser. Grok city notes stay off unless `NEXT_PUBLIC_ENABLE_EXTRA_AI=true`, and they never plan the trip. The agent network is a way for another site to call the same rules, not a second product personality.

## 6. Consequences

| Consequence | What can go wrong | Mitigation already present | Mitigation still needed |
| --- | --- | --- | --- |
| A day that survives a closure or a shower | Someone trusts a bad swap | One tap; other stops kept; sample is labeled | Re-check on the day, and say when hours are unknown |
| Less time assembling a city day | People skip their own judgment | Interests are explicit; revisions are narrow | Show why a place was picked, including weak OSM data |
| Privacy of a spoken trip | Speech API audio, cloud prompts, a key in `localStorage` | Intent can stay on device; xAI key stays on the server; peer calls omit the key | Say which path ran before the first cloud prompt; do not store trip text by default |
| Safety | A drive-only plan, a long leg, a mountain last-bus error like the BBC story | Long legs are flagged at 40 minutes | Add a way home and a no-car mode; never imply a route is safe |
| Over-reliance | Unknown hours look fine | Closed and rainy cases are named | Treat unknown hours as unknown on the card |
| Bias | English, driving, and "famous node" bias | Interest list is small and visible | Walking or transit, and a warning when a place has no hours |
| Work | Could be sold as replacing advisors | It does not book or price | Keep that limit in the product, not only the README |
| Misuse | A public agent network could be prompted to invent | Instructions say not to invent; writes confirm | Keep site actions on this origin; do not execute peer code |
| Law and data | OSM, map tiles, and model terms; personal trip notes | No accounts; no committed keys; App Check is wired for Firebase | Publish a short data note before a public deploy; confirm tile and OSM attribution stay visible |

## 7. Alternatives, and the Firebase criteria

People already plan with Google Maps and Google's Gemini travel help, Wanderlog, Mindtrip, Layla, TripIt (which organizes bookings rather than inventing a day), and a general chatbot. Those products are broader: bookings, collaboration, flights, and hotels. This one is narrower on purpose. The part that is different is the refusal to let the model be the map. Stops come from OpenStreetMap. Hours, weather, and drive time are checks. A change waits for a person.

Against the #BuildHybridAI criteria:

- **Technical use of hybrid inference.** Real, and limited to intent and narration. The planner does not need a model, which is the right split. Judges will still see "Deterministic fallback" until a Firebase project is connected. App Check is implemented and idle without a site key.
- **Design.** One job, one page, empty and error states, a phone layout. It is a concierge for a city day, not a travel agency.
- **Impact.** Credible for the person who gets blamed for a closed museum. Not credible as a cure for the 16 hours of booking and price shopping in the Priceline study.
- **Idea.** The non-obvious part is human approval plus grounded checks. The agent-network tab and Grok card are secondary. They should not lead the story.

## 8. Candidates, only if they serve the assistant

**A. Morning re-check of a trip saved on this device.** This is in the live app. The watch runs again against hours and the forecast, and still waits for a tap. The trip is stored in this browser, with a delete control, and the tests keep that store apart from any model key.

**B. No-car mode.** Walking or transit time, and a warning when the only route is a drive. Pros: the drive-only plan is the biggest safety and bias gap. Cons: coverage is uneven, and the UI must not pretend a bad transit result is a promise.

**C. Honest unknown hours.** If OSM has no hours or the syntax is outside the parser, the card says unknown instead of looking open. Pros: small, and it directly answers the SEO Travel and BBC failures. Cons: more cards will look unfinished, which is the point.

Not recommended: booking, payments, a louder Grok, or more agent theater. Those show range. They do not make the day more honest.

## 9. If Mark says yes

Order, after approval. Sizes are scope, not a calendar.

1. **Unknown hours on the card.** In the live app: `lib/opening-hours.ts`, `lib/autonomy.ts`, the stop card, and a Vitest case.
2. **Seattle sample never pretends to be the requested city.** In the live app. The sample says the stops are in Seattle when the traveler asked for somewhere else.
3. **Save this trip in the browser and re-run the watch.** In the live app: `lib/saved-trip.ts`, the morning check, a delete control, and tests that the stored trip stays apart from model keys.
4. **No-car routing.** Not in the live app. `app/api/drive` is still a driving profile. Do this only if the audience is not drivers. That choice should be explicit.
5. **Do not expand Grok, accounts, or the agent tab.** The live hackathon build leaves `NEXT_PUBLIC_ENABLE_EXTRA_AI` unset. Planning stays on Firebase AI Logic.

Tests stay in Vitest with no network. The morning check is in the app. A demo video of that check is not in this repo.
