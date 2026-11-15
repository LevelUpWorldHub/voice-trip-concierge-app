"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tripActions } from "@/public/runtime/trip-actions.js";
import { createDeterministicLlm, createEngine, createOpenAICompatibleLlm } from "@/public/runtime/index.js";

type Byok = { baseUrl: string; model: string; apiKey: string };

const STORAGE_KEY = "vtc-byok";

type Consent = { origin: string; purpose: string; resolve: (allowed: boolean) => void };
type Confirm = { name: string; arguments: unknown; origin: string; resolve: (allowed: boolean) => void };

export function AgentPanel({
  onPlan,
  onRevise,
  onRead,
  onPropose,
  onApply,
}: {
  onPlan: (text: string) => Promise<string>;
  onRevise: (text: string) => Promise<string>;
  onRead: () => string;
  onPropose: () => string;
  onApply: (proposalId: string) => Promise<string>;
}) {
  const [prompt, setPrompt] = useState("Plan 3 days in Seattle for food and parks");
  const [output, setOutput] = useState("The network has not run in this tab yet.");
  const [trace, setTrace] = useState<{ agent: string; tool: string; ok: boolean; detail: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [byok, setByok] = useState<Byok>({ baseUrl: "https://api.x.ai/v1", model: "grok-4.7", apiKey: "" });
  const [consent, setConsent] = useState<Consent | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [routerLabel, setRouterLabel] = useState("Deterministic on-page router");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    queueMicrotask(() => {
      try {
        const parsed = JSON.parse(stored) as Byok;
        if (parsed.baseUrl && parsed.model) setByok(parsed);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    });
  }, []);

  function saveByok() {
    if (!byok.apiKey.trim()) {
      window.localStorage.removeItem(STORAGE_KEY);
      setRouterLabel("Deterministic on-page router");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(byok));
    setRouterLabel(`BYOK ${byok.model}`);
  }

  function clearByok() {
    window.localStorage.removeItem(STORAGE_KEY);
    setByok((current) => ({ ...current, apiKey: "" }));
    setRouterLabel("Deterministic on-page router");
  }

  async function runNetwork() {
    setBusy(true);
    try {
      const response = await fetch("/voice_trip_concierge.network.json");
      const linksResponse = await fetch("/links.json");
      const network = await response.json();
      const links = await linksResponse.json();
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const profile = stored ? (JSON.parse(stored) as Byok) : null;
      const llm = profile?.apiKey
        ? createOpenAICompatibleLlm({ baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model })
        : createDeterministicLlm();
      const engine = createEngine({
        network,
        frontMan: "front_desk",
        origin: window.location.origin,
        links: links.networks.voice_trip_concierge,
        llm,
        actions: tripActions.map((action: { name: string; effect: string; description: string; parameters: object }) => ({
          ...action,
          handler: async (args: { request?: string; proposalId?: string }) => {
            if (action.name === "website_plan_trip") return onPlan(args.request || prompt);
            if (action.name === "website_revise_stop") return onRevise(args.request || prompt);
            if (action.name === "website_propose_swaps") return onPropose();
            if (action.name === "website_apply_swap") return onApply(args.proposalId || "latest");
            return onRead();
          },
        })),
        confirm: (request: { name: string; arguments: unknown; origin: string }) =>
          new Promise<boolean>((resolve) => setConfirm({ ...request, resolve })),
        requestConsent: (request: { origin: string; purpose: string }) =>
          new Promise<boolean>((resolve) => setConsent({ ...request, resolve })),
      });
      const result = await engine.run(prompt, { privateContext: { sessionOnly: true } });
      setOutput(result.ok ? result.text : result.error);
      setTrace(result.trace || []);
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "The agent runtime stopped.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Browser agent network</CardTitle>
          <CardDescription>
            This panel runs <span className="font-medium text-foreground">/runtime/index.js</span> against the published
            network. Router: {routerLabel}. A visitor key stays in this browser and is sent only to the router URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="agent-prompt">Ask the front desk</FieldLabel>
              <Input id="agent-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runNetwork} disabled={busy}>
              {busy ? "Running" : "Run network"}
            </Button>
            <Button variant="outline" render={<a href="/agent-manifest.json" target="_blank" rel="noreferrer" />}>
              Manifest
            </Button>
            <Button variant="outline" render={<a href="/voice_trip_concierge.network.json" target="_blank" rel="noreferrer" />}>
              Network JSON
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{output}</p>
          <ScrollArea className="h-36 rounded-lg border">
            <ul className="flex flex-col gap-2 p-3 text-xs">
              {trace.length === 0 ? <li>No agent calls yet.</li> : null}
              {trace.map((entry, index) => (
                <li key={`${entry.tool}-${index}`}>
                  {entry.agent} → {entry.tool} {entry.ok ? "ok" : "stopped"}: {entry.detail}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bring your own model</CardTitle>
          <CardDescription>
            Optional. Leave the key blank to keep the free on-page router. Delete removes the saved profile from this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="byok-url">OpenAI-compatible base URL</FieldLabel>
              <Input id="byok-url" value={byok.baseUrl} onChange={(event) => setByok({ ...byok, baseUrl: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="byok-model">Model</FieldLabel>
              <Input id="byok-model" value={byok.model} onChange={(event) => setByok({ ...byok, model: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="byok-key">API key</FieldLabel>
              <Input id="byok-key" type="password" autoComplete="off" value={byok.apiKey} onChange={(event) => setByok({ ...byok, apiKey: event.target.value })} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={saveByok}>Save in this browser</Button>
          <Button variant="outline" onClick={clearByok}>Delete saved key</Button>
        </CardFooter>
      </Card>
      <Dialog open={Boolean(consent)} onOpenChange={(open) => { if (!open && consent) { consent.resolve(false); setConsent(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact another origin?</DialogTitle>
            <DialogDescription>
              {consent?.purpose}. Destination origin: {consent?.origin}. The model key is not included.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { consent?.resolve(false); setConsent(null); }}>Deny</Button>
            <Button onClick={() => { consent?.resolve(true); setConsent(null); }}>Allow this session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open && confirm) { confirm.resolve(false); setConfirm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this change?</DialogTitle>
            <DialogDescription>
              {confirm?.name} on {confirm?.origin}. Arguments: {JSON.stringify(confirm?.arguments)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { confirm?.resolve(false); setConfirm(null); }}>Keep the trip</Button>
            <Button onClick={() => { confirm?.resolve(true); setConfirm(null); }}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
