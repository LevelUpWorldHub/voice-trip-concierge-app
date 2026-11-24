"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MicIcon, SendIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { AgentPanel } from "@/components/agent-panel";
import { TripMap } from "@/components/trip-map";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { validatePulseCity } from "@/lib/api-input";
import { extraAiEnabled } from "@/lib/feature-flags";
import { inspectItinerary } from "@/lib/autonomy";
import { estimateDrive } from "@/lib/geo";
import { scrollElementToLatest } from "@/lib/chat-scroll";
import { sampleHealLog } from "@/lib/heal-log";
import { firebaseConfigured, interpretWithHybrid, kickDeviceModel, narrateWithHybrid, type HybridTrace } from "@/lib/hybrid-ai";
import { interpretText, type Slot } from "@/lib/intent";
import { narrateApplied, narrateItinerary } from "@/lib/narration";
import { hoursLabel, isOpen } from "@/lib/opening-hours";
import { assembleTrip, type AssembledTrip } from "@/lib/plan-client";
import type { RouteFn } from "@/lib/planner";
import { replaceStop, reviseByText } from "@/lib/revisions";
import { morningChanges, parseSavedTrip, SAVED_TRIP_KEY, serializeSavedTrip, snapshotChecks, type MorningChange, type SavedTrip } from "@/lib/saved-trip";
import { buildSeattleSample, seattleRoute, SEATTLE_PLACES } from "@/lib/seattle";
import { createRecognizer, speak, speechRecognitionSupported } from "@/lib/speech";
import { localIsoDate } from "@/lib/time";
import type { Itinerary, Place, Proposal, ServiceHealth, TripRequest } from "@/lib/types";

type Message = { id: string; role: "traveler" | "concierge"; text: string };

const SUGGESTIONS = [
  "Plan 3 days in Seattle for food, parks, and museums",
  "A relaxed weekend of museums in Lisbon",
];

function routeFor(itinerary: Itinerary): RouteFn {
  if (itinerary.dataSource === "snapshot") return (from, to) => seattleRoute(from, to);
  return (from, to) => ({ ...estimateDrive(from, to), source: "estimate" });
}

function badgeLabel(trace: HybridTrace): string {
  if (trace.path === "on-device") return `On-device · ${trace.latencyMs} ms`;
  if (trace.path === "cloud") return `Cloud Gemini · ${trace.latencyMs} ms`;
  return "Deterministic fallback";
}

export function ConciergeApp() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "concierge",
      text: "Tell me the city, how many days, and what you want from them. I'll ask only for what's still missing.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [partial, setPartial] = useState<Partial<TripRequest>>({});
  const [awaiting, setAwaiting] = useState<Slot | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [catalog, setCatalog] = useState<Place[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [trace, setTrace] = useState<HybridTrace>({
    path: "deterministic",
    latencyMs: 0,
    detail: firebaseConfigured()
      ? "Firebase AI Logic is configured. The next message will try on-device Gemini Nano, then cloud Gemini."
      : "No Firebase web config. Planning still runs, and intent uses the local parser.",
  });
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [pulse, setPulse] = useState<{ notes: { text: string; citations: string[] }[]; reason: string } | null>(null);
  const [healLog, setHealLog] = useState<string[]>([
    "Waiting for the first plan. A failed map call will switch to the labeled Seattle sample instead of blanking the page.",
  ]);
  const [listenHint, setListenHint] = useState(false);
  const [savedTrip, setSavedTrip] = useState<SavedTrip | null>(null);
  const [morning, setMorning] = useState<{ note: string; changes: MorningChange[] } | null>(null);
  const recognizer = useRef<ReturnType<typeof createRecognizer>>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const itineraryRef = useRef(itinerary);
  const catalogRef = useRef(catalog);
  const proposalsRef = useRef(proposals);
  itineraryRef.current = itinerary;
  catalogRef.current = catalog;
  proposalsRef.current = proposals;

  useEffect(() => {
    const root = chatLogRef.current;
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']");
    scrollElementToLatest(viewport);
  }, [messages]);

  useEffect(() => {
    queueMicrotask(() => {
      setListenHint(!speechRecognitionSupported());
      if (new URLSearchParams(window.location.search).get("demo") === "1") setVoiceOn(false);
      const stored = parseSavedTrip(window.localStorage.getItem(SAVED_TRIP_KEY));
      if (!stored) return;
      setSavedTrip(stored);
      setItinerary(stored.itinerary);
      setCatalog(stored.catalog);
      setProposals(inspectItinerary(stored.itinerary, stored.catalog, routeFor(stored.itinerary)));
      void refreshMorning(stored);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled && Array.isArray(body.services)) setServices(body.services);
      })
      .catch(() => {
        if (!cancelled) {
          setServices([{ id: "health", label: "Health probe", status: "down", detail: "The status probe did not answer. The planner can still use the Seattle sample." }]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const day = itinerary?.days[dayIndex] ?? itinerary?.days[0];

  function say(text: string) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "concierge", text }]);
    if (voiceOn) speak(text);
  }

  function applyAssembled(assembled: AssembledTrip) {
    const route = routeFor(assembled.itinerary);
    const nextProposals = inspectItinerary(assembled.itinerary, assembled.catalog, route);
    setItinerary(assembled.itinerary);
    setCatalog(assembled.catalog);
    setProposals(nextProposals);
    setDayIndex(0);
    setServices((current) => {
      const ids = new Set(assembled.services.map((service) => service.id));
      return [...assembled.services, ...current.filter((service) => !ids.has(service.id))];
    });
    if (assembled.services.length) {
      setHealLog(assembled.services.map((service) => `${service.label}: ${service.detail}`));
    }
    return nextProposals;
  }

  function loadSample() {
    const sample = buildSeattleSample({ destination: "Seattle", days: 3, interests: ["food", "parks", "museums"], pace: "balanced" });
    setHealLog(sampleHealLog(firebaseConfigured()));
    const next = applyAssembled({ itinerary: sample, catalog: SEATTLE_PLACES, services: [] });
    const trip: SavedTrip = {
      version: 1,
      itinerary: sample,
      catalog: SEATTLE_PLACES,
      savedAt: new Date().toISOString(),
      checks: snapshotChecks(sample),
    };
    window.localStorage.setItem(SAVED_TRIP_KEY, serializeSavedTrip(trip));
    setSavedTrip(trip);
    const check = morningChanges(trip, localIsoDate(), routeFor(sample));
    setMorning({ note: check.note, changes: check.changes });
    const lead = next[0]?.detail;
    say(lead ? `${narrateItinerary(sample)} ${lead}` : narrateItinerary(sample));
  }

  async function refreshMorning(stored: SavedTrip) {
    const today = localIsoDate();
    let current = stored.itinerary;
    let refreshNote = "";
    if (stored.itinerary.days.some((day) => day.date === today)) {
      try {
        const response = await fetch(
          `/api/weather?lat=${stored.itinerary.center.lat}&lon=${stored.itinerary.center.lon}`,
        );
        const body = (await response.json()) as { ok?: boolean; days?: { summary: string; tempC: number; precipProb: number; code: number }[] };
        if (body.ok && Array.isArray(body.days)) {
          current = {
            ...stored.itinerary,
            days: stored.itinerary.days.map((day, index) => ({
              ...day,
              weather: body.days?.[index] ?? day.weather,
            })),
          };
        } else {
          refreshNote = " The live forecast could not be refreshed.";
        }
      } catch {
        refreshNote = " The live forecast could not be refreshed.";
      }
    }
    const check = morningChanges(stored, today, routeFor(stored.itinerary), current);
    setMorning({ note: `${check.note}${refreshNote}`, changes: check.changes });
  }

  function saveOnDevice() {
    const current = itineraryRef.current;
    if (!current) return;
    const trip: SavedTrip = {
      version: 1,
      itinerary: current,
      catalog: catalogRef.current,
      savedAt: new Date().toISOString(),
      checks: snapshotChecks(current),
    };
    window.localStorage.setItem(SAVED_TRIP_KEY, serializeSavedTrip(trip));
    setSavedTrip(trip);
    const check = morningChanges(trip, localIsoDate(), routeFor(current));
    setMorning({ note: check.note, changes: check.changes });
    say(check.note);
  }

  function forgetSavedTrip() {
    window.localStorage.removeItem(SAVED_TRIP_KEY);
    setSavedTrip(null);
    setMorning(null);
  }

  async function handleText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "traveler", text: trimmed }]);
    kickDeviceModel();
    try {
      const local = interpretText(trimmed, partial, { hasItinerary: Boolean(itineraryRef.current), awaiting });
      const hybrid = await interpretWithHybrid(trimmed, local);
      const interpretation = hybrid?.interpretation ?? local;
      if (hybrid) setTrace(hybrid.trace);
      setPartial(interpretation.partial);
      setAwaiting(interpretation.missing);
      if (interpretation.kind === "clarify" && interpretation.question) {
        say(interpretation.question);
        return;
      }
      if (interpretation.kind === "approve" && proposalsRef.current[0] && itineraryRef.current) {
        approve(proposalsRef.current[0]);
        return;
      }
      if (interpretation.kind === "dismiss") {
        setProposals([]);
        say("Kept every stop. I'll keep watching if you ask again.");
        return;
      }
      if (interpretation.kind === "revise" && itineraryRef.current) {
        const current = itineraryRef.current;
        const result = reviseByText(current, interpretation.revisionText || trimmed, catalogRef.current, routeFor(current));
        setItinerary(result.itinerary);
        const nextProposals = inspectItinerary(result.itinerary, catalogRef.current, routeFor(result.itinerary));
        setProposals(nextProposals);
        say(result.message);
        return;
      }
      if (interpretation.kind !== "plan") {
        say("I can plan a city, change one stop, or approve a swap I already proposed.");
        return;
      }
      const request = interpretation.partial as TripRequest;
      const assembled = await assembleTrip(request);
      const nextProposals = applyAssembled(assembled);
      const template = narrateItinerary(assembled.itinerary);
      const narration = await narrateWithHybrid(assembled.itinerary, template);
      setTrace(narration.trace);
      const extra = nextProposals[0] ? ` ${nextProposals[0].detail}` : "";
      say(`${narration.text}${extra}`);
    } catch (error) {
      const sample = buildSeattleSample(partial.destination ? (partial as TripRequest) : { destination: "Seattle" }, error instanceof Error ? error.message : "Unexpected error");
      applyAssembled({ itinerary: sample, catalog: SEATTLE_PLACES, services: [] });
      say(`Something failed while I was working, so I put the labeled Seattle sample on the timeline. ${error instanceof Error ? error.message : ""}`);
    } finally {
      setBusy(false);
    }
  }

  function approve(proposal: Proposal) {
    const current = itineraryRef.current;
    if (!current) return;
    const previous = current.days.flatMap((item) => item.stops).find((stop) => stop.id === proposal.stopId);
    const next = replaceStop(current, proposal.stopId, proposal.replacement, routeFor(current), catalogRef.current);
    const nextProposals = inspectItinerary(next, catalogRef.current, routeFor(next)).filter((item) => item.id !== proposal.id);
    setItinerary(next);
    setProposals(nextProposals);
    if (savedTrip) {
      const trip: SavedTrip = {
        ...savedTrip,
        itinerary: next,
        catalog: catalogRef.current,
        savedAt: new Date().toISOString(),
        checks: snapshotChecks(next),
      };
      window.localStorage.setItem(SAVED_TRIP_KEY, serializeSavedTrip(trip));
      setSavedTrip(trip);
      const check = morningChanges(trip, localIsoDate(), routeFor(next));
      setMorning({ note: check.note, changes: check.changes });
    }
    const spoken = narrateApplied(previous?.name || "That stop", proposal.replacement.name);
    say(spoken);
    toast.success(spoken);
  }

  function toggleMic() {
    if (listening) {
      recognizer.current?.stop();
      setListening(false);
      return;
    }
    const next = createRecognizer(
      (text, final) => {
        setDraft(text);
        if (final) {
          setListening(false);
          void handleText(text);
        }
      },
      (message) => {
        setListening(false);
        say(message === "not-allowed" ? "Microphone permission was blocked. You can still type." : `Voice input stopped: ${message}.`);
      },
    );
    if (!next) {
      say("This browser has no Web Speech recognition. Typing works the same way.");
      return;
    }
    recognizer.current = next;
    setListening(true);
    next.start();
  }

  async function loadPulse() {
    if (!extraAiEnabled() || !itinerary) return;
    if (itinerary.sampleStandsIn === false) {
      setPulse({ notes: [], reason: `City notes stay off. This is not a plan for ${itinerary.askedFor}.` });
      return;
    }
    const city = validatePulseCity({ city: itinerary.destination });
    if (!city.ok) {
      setPulse({ notes: [], reason: city.error });
      return;
    }
    try {
      const response = await fetch("/api/city-pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: city.value }),
      });
      const body = await response.json();
      setPulse({ notes: body.notes || [], reason: body.reason || "" });
      setHealLog((current) => [
        body.enabled
          ? "Grok returned cited notes. The itinerary was not rebuilt from them."
          : "Grok stayed off. Planning continued on the deterministic fallback.",
        ...current,
      ].slice(0, 6));
      setServices((current) => [
        {
          id: "grok",
          label: "Grok city pulse",
          status: body.enabled ? (body.notes?.length ? "ok" : "degraded") : "off",
          detail: body.reason || (body.enabled ? "Notes returned." : "Off."),
        },
        ...current.filter((service) => service.id !== "grok"),
      ]);
    } catch (error) {
      setPulse({ notes: [], reason: error instanceof Error ? error.message : "City pulse failed." });
    }
  }

  const serviceRows = useMemo(() => services, [services]);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
      <header className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Level Up Inc · Mark Yukhimets</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Voice Trip Concierge</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            The watch notices a closed door, rain, or a long drive and proposes one swap. You approve it with a tap. The rest of the day stays.
          </p>
        </div>
        <Badge data-testid="inference-badge" variant={trace.path === "deterministic" ? "outline" : "default"}>{badgeLabel(trace)}</Badge>
      </header>
      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-3">
          <div ref={chatLogRef} data-testid="chat-log" className="h-72 min-h-0 lg:h-[calc(100svh-16rem)]">
            <ScrollArea className="h-full rounded-xl border">
              <div className="flex flex-col gap-3 p-3" aria-live="polite">
                {messages.map((message, index) => (
                  <Card
                    key={message.id}
                    size="sm"
                    className={message.role === "traveler" ? "bg-secondary" : ""}
                    data-testid={index === messages.length - 1 ? "chat-latest" : "chat-message"}
                  >
                    <CardHeader>
                      <CardDescription>{message.role === "traveler" ? "You" : "Concierge"}</CardDescription>
                      <CardTitle className="text-sm font-normal">{message.text}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
                <div data-testid="chat-end" aria-hidden="true" />
              </div>
            </ScrollArea>
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleText(draft);
            }}
          >
            <Textarea
              data-testid="trip-request"
              value={draft}
              placeholder="Three days in Seattle for food and parks"
              aria-label="Trip request"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleText(draft);
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" data-testid="send" disabled={busy || !draft.trim()}>
                {busy ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                Send
              </Button>
              <Button type="button" variant={listening ? "destructive" : "outline"} onClick={toggleMic}>
                {listening ? <SquareIcon data-icon="inline-start" /> : <MicIcon data-icon="inline-start" />}
                {listening ? "Stop" : "Speak"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setVoiceOn((value) => !value)}>
                {voiceOn ? "Voice replies on" : "Voice replies off"}
              </Button>
            </div>
            {!listenHint ? null : (
              <p className="text-xs text-muted-foreground">Web Speech recognition is unavailable here. Typing uses the same planner.</p>
            )}
          </form>
        </section>
        <Tabs defaultValue="plan">
          <TabsList>
            <TabsTrigger value="plan" data-testid="tab-plan">Plan</TabsTrigger>
            <TabsTrigger value="watch" data-testid="tab-watch">Watch{proposals.length ? ` ${proposals.length}` : ""}</TabsTrigger>
            <TabsTrigger value="map" data-testid="tab-map">Map</TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">Status</TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-agents">Agents</TabsTrigger>
          </TabsList>
          <TabsContent value="plan" className="flex flex-col gap-3">
            {!itinerary && !busy ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>The watch is idle</EmptyTitle>
                  <EmptyDescription>
                    Give a city, a length, and a leaning. Or open the labeled Seattle sample: a Monday closure, Tuesday rain, and a 46 minute drive are already waiting for one tap.
                  </EmptyDescription>
                </EmptyHeader>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button key={suggestion} variant="outline" onClick={() => void handleText(suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                  <Button data-testid="load-sample" onClick={loadSample}>Load Seattle sample</Button>
                </div>
              </Empty>
            ) : null}
            {busy && !itinerary ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Tracing streets, hours, and weather.</p>
              </div>
            ) : null}
            {itinerary ? (
              <>
                {itinerary.sampleLabel ? (
                  <Alert data-testid="sample-alert">
                    <AlertTitle>{itinerary.sampleStandsIn === false ? `Not a plan for ${itinerary.askedFor}` : itinerary.sampleLabel}</AlertTitle>
                    <AlertDescription>{itinerary.warnings[0]}</AlertDescription>
                  </Alert>
                ) : null}
                {morning ? (
                  <Alert data-testid="morning-check">
                    <AlertTitle>{morning.changes.length ? "Morning check" : "Saved trip"}</AlertTitle>
                    <AlertDescription>{morning.note}</AlertDescription>
                  </Alert>
                ) : null}
                {morning?.changes.map((change) => (
                  <Card key={change.stopId} data-testid="morning-change">
                    <CardHeader>
                      <CardTitle>{change.stopName}</CardTitle>
                      <CardDescription>{change.detail}</CardDescription>
                    </CardHeader>
                    {change.proposal ? (
                      <CardFooter>
                        <Button data-testid="morning-approve" onClick={() => approve(change.proposal as Proposal)}>Approve swap</Button>
                      </CardFooter>
                    ) : null}
                  </Card>
                ))}
                {itinerary.warnings.filter((_, index) => !(itinerary.sampleLabel && index === 0)).map((warning) => (
                  <Alert key={warning}>
                    <AlertTitle>Heads up</AlertTitle>
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {itinerary.days.map((item, index) => (
                      <Button key={item.date} size="sm" variant={index === dayIndex ? "default" : "outline"} onClick={() => setDayIndex(index)}>
                        {item.title}
                      </Button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" data-testid="save-trip" onClick={saveOnDevice}>
                      {savedTrip ? "Update saved trip" : "Save on this device"}
                    </Button>
                    {savedTrip ? (
                      <Button type="button" variant="ghost" size="sm" onClick={forgetSavedTrip}>Delete saved trip</Button>
                    ) : null}
                  </div>
                </div>
                {proposals[0] ? (
                  <Card data-testid="proposal-card">
                    <CardHeader>
                      <CardDescription>Autonomy watch · one tap · other stops stay</CardDescription>
                      <CardTitle>Proposed swap</CardTitle>
                    </CardHeader>
                    <CardContent><p className="text-sm">{proposals[0].detail}</p></CardContent>
                    <CardFooter className="gap-2">
                      <Button data-testid="approve-swap" onClick={() => approve(proposals[0])}>Approve swap</Button>
                      <Button variant="outline" onClick={() => setProposals((current) => current.slice(1))}>Keep it</Button>
                    </CardFooter>
                  </Card>
                ) : null}
                {extraAiEnabled() ? (
                <Card data-testid="city-pulse-card" size="sm">
                  <CardHeader>
                    <CardTitle>Grok city pulse</CardTitle>
                    <CardDescription>
                      Optional xAI notes with the citations Grok actually visited. Planning and narration stay on Firebase AI Logic, or the deterministic fallback when that config is absent.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    {pulse?.notes.length ? pulse.notes.map((note) => <p key={note.text} className="text-sm">{note.text}</p>) : (
                      <p data-testid="pulse-reason" className="text-sm text-muted-foreground">
                        {pulse?.reason || "Off until XAI_API_KEY is set. The trip does not wait on it."}
                      </p>
                    )}
                    {pulse?.notes[0]?.citations.map((citation) => (
                      <a key={citation} className="text-xs text-primary underline-offset-4 hover:underline" href={citation} target="_blank" rel="noreferrer">{citation}</a>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <Button data-testid="city-pulse" variant="outline" size="sm" onClick={() => void loadPulse()}>Ask Grok</Button>
                  </CardFooter>
                </Card>
                ) : null}
                {day ? (
                  <ol className="flex flex-col gap-3">
                    {day.stops.map((stop, index) => (
                      <li key={stop.id}>
                        <Card size="sm">
                          <CardHeader>
                            <CardDescription>
                              {stop.arrival}–{stop.depart}
                              {index > 0 && day.legs[index - 1] ? ` · ${day.legs[index - 1].minutes} min ${day.legs[index - 1].source}` : ""}
                            </CardDescription>
                            <CardTitle>{stop.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm text-muted-foreground">
                            {stop.interest} · {stop.indoor ? "indoor" : "outdoor"}
                            {` · ${hoursLabel(isOpen(stop.openingHours, day.date, stop.arrival))}`}
                            {stop.openingHours ? ` · ${stop.openingHours}` : ""}
                            {stop.address ? ` · ${stop.address}` : ""}
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {day?.weather ? (
                  <p className="text-sm text-muted-foreground">{day.weather.summary}. Precipitation probability {day.weather.precipProb}%.</p>
                ) : null}
              </>
            ) : null}
          </TabsContent>
          <TabsContent value="map">
            {itinerary && day ? <TripMap itinerary={itinerary} dayIndex={dayIndex} /> : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>The map waits for a plan</EmptyTitle>
                  <EmptyDescription>Stops and the driving line appear here after a trip is built.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
          <TabsContent value="watch" className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={loadSample}>Load Seattle sample</Button>
              <Button
                variant="outline"
                disabled={!itinerary}
                onClick={() => {
                  if (!itinerary) return;
                  setProposals(inspectItinerary(itinerary, catalog, routeFor(itinerary)));
                }}
              >
                Check again
              </Button>
            </div>
            {proposals.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>Nothing to change</EmptyTitle>
                  <EmptyDescription>Hours, weather, and drive length look fine, or there is no trip to watch yet.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : proposals.map((proposal) => (
              <Card key={proposal.id}>
                <CardHeader>
                  <CardDescription>Day {proposal.day} · {proposal.reason}</CardDescription>
                  <CardTitle>{proposal.replacement.name}</CardTitle>
                </CardHeader>
                <CardContent><p className="text-sm">{proposal.detail}</p></CardContent>
                <CardFooter>
                  <Button onClick={() => approve(proposal)}>Approve swap</Button>
                </CardFooter>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="status" className="flex flex-col gap-3" data-testid="status-panel">
            <Alert>
              <AlertTitle>Self-healing</AlertTitle>
              <AlertDescription>
                Timeouts retry with backoff. A dead map service loads the labeled Seattle sample. A dead router keeps the places and marks the drive as an estimate. Nothing here clears the itinerary.
              </AlertDescription>
            </Alert>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Latest recovery</CardTitle>
                <CardDescription>{trace.detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground" data-testid="heal-log">
                  {healLog.map((line, index) => <li key={`${index}-${line}`} data-testid="heal-log-line">{line}</li>)}
                </ul>
              </CardContent>
            </Card>
            {serviceRows.length === 0 ? <Skeleton className="h-20 w-full" /> : null}
            {serviceRows.map((service) => (
              <Card key={service.id} size="sm" data-testid={`service-${service.id}`}>
                <CardHeader>
                  <CardDescription>
                    <Badge variant={service.status === "ok" ? "default" : service.status === "down" ? "destructive" : "outline"}>{service.status}</Badge>
                    {service.latencyMs != null ? ` · ${service.latencyMs} ms` : ""}
                  </CardDescription>
                  <CardTitle>{service.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{service.detail}</CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="agents">
            <AgentPanel
              onRead={() => (itineraryRef.current ? narrateItinerary(itineraryRef.current) : "No trip is on the page yet.")}
              onPropose={() => {
                const current = itineraryRef.current;
                if (!current) return "No trip to inspect.";
                const next = inspectItinerary(current, catalogRef.current, routeFor(current));
                setProposals(next);
                return next.length ? next.map((proposal) => proposal.detail).join(" ") : "No swaps proposed.";
              }}
              onApply={async (proposalId) => {
                const proposal = proposalsRef.current.find((item) => item.id === proposalId) || proposalsRef.current[0];
                if (!proposal) return "There is no pending swap.";
                approve(proposal);
                return `Applied ${proposal.replacement.name}.`;
              }}
              onRevise={async (text) => {
                const current = itineraryRef.current;
                if (!current) return "Plan a trip before revising a stop.";
                const result = reviseByText(current, text, catalogRef.current, routeFor(current));
                setItinerary(result.itinerary);
                setProposals(inspectItinerary(result.itinerary, catalogRef.current, routeFor(result.itinerary)));
                return result.message;
              }}
              onPlan={async (text) => {
                const local = interpretText(text);
                if (local.kind !== "plan") return local.question || "I need a city, days, and interests.";
                const assembled = await assembleTrip(local.partial as TripRequest);
                applyAssembled(assembled);
                setPartial(local.partial);
                return narrateItinerary(assembled.itinerary);
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
      <div
        id="demo-caption"
        data-testid="demo-caption"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 hidden border-t bg-background px-6 py-4 text-center text-lg font-medium"
      />
    </div>
  );
}
