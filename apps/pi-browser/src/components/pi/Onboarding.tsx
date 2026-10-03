"use client";

/**
 * Landing + setup flow: connect a Pollinations account (BYO Pollen), choose a
 * model, optionally configure the WISP network tunnel, then launch the sandbox.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  CircleDot,
  Cpu,
  Flower2,
  Github,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  Unplug,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  APP_KEY,
  formatPollen,
  pollenPerMillion,
} from "@/lib/pollinations";
import {
  createWispDeploymentUrl,
  LOCAL_WISP_COMMAND,
} from "@/lib/wisp";
import type {
  LoadProgress,
  PollenBalance,
  PollinationsModel,
  PollenSession,
  SandboxPhase,
} from "@/lib/types";

interface OnboardingProps {
  pollen: PollenSession | null;
  balance: PollenBalance | null;
  models: PollinationsModel[] | null;
  modelsError: string | null;
  selectedModel: string | null;
  onSelectModel: (id: string) => void;
  wispUrl: string | null;
  onWispChosen: (url: string) => void;
  crossOriginIsolated: boolean;
  sandboxPhase: SandboxPhase;
  loadProgress: LoadProgress | null;
  canLaunch: boolean;
  launching: boolean;
  onLaunch: () => void;
  onConnectOAuth: () => void;
  onManualKey: (key: string) => Promise<void>;
  onDisconnectPollen: () => void;
  onRefreshBalance: () => void;
}

function StepCard({
  index,
  title,
  subtitle,
  done,
  children,
}: {
  index: number;
  title: string;
  subtitle: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={`panel-glow relative overflow-hidden border transition-colors ${
        done ? "border-pollen/40" : "border-border"
      }`}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
              done
                ? "border-pollen/50 bg-pollen/15 text-pollen"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {done ? <BadgeCheck className="h-4.5 w-4.5" aria-hidden /> : index}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function Onboarding(props: OnboardingProps) {
  const {
    pollen,
    balance,
    models,
    modelsError,
    selectedModel,
    onSelectModel,
    wispUrl,
    onWispChosen,
    crossOriginIsolated,
    sandboxPhase,
    loadProgress,
    canLaunch,
    launching,
    onLaunch,
    onConnectOAuth,
    onManualKey,
    onDisconnectPollen,
    onRefreshBalance,
  } = props;

  const [search, setSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualKey, setManualKey] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [customWisp, setCustomWisp] = useState("");
  // Computed after mount — the URL depends on window.location, which the
  // server-side render pass does not have.
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  useEffect(() => {
    setDeployUrl(createWispDeploymentUrl());
  }, []);

  const filteredModels = useMemo(() => {
    const list = models ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((m) =>
      [m.name, m.title, m.publisher, m.description]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }, [models, search]);

  const launchPercent =
    loadProgress?.percent != null ? Math.round(loadProgress.percent) : null;
  const downloadedMb =
    loadProgress && loadProgress.totalBytes
      ? `${(loadProgress.downloadedBytes / 1_048_576).toFixed(1)} / ${(loadProgress.totalBytes / 1_048_576).toFixed(1)} MB`
      : loadProgress
        ? `${(loadProgress.downloadedBytes / 1_048_576).toFixed(1)} MB`
        : null;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="aura" aria-hidden />
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        {/* ---------- hero ---------- */}
        <header className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Flower2 className="h-3.5 w-3.5 text-pollen" aria-hidden />
            A Pollinations example app
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Pi in the Browser,{" "}
            <span className="pollen-gradient-text">powered by your Pollen</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
            The <strong className="text-foreground">real Pi coding agent</strong> — the actual
            <code className="mx-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">pi</code>
            CLI from earendil-works — running entirely in a WebAssembly sandbox inside this tab.
            Connect your Pollinations account, pick a model, and watch Pi create and run projects
            on your machine. No server involved.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Cpu className="h-3 w-3 text-pollen" aria-hidden /> Real Pi v0.87.1 via WASIX
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <ShieldCheck className="h-3 w-3 text-pollen" aria-hidden /> Bring your own Pollen
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <Server className="h-3 w-3 text-pollen" aria-hidden /> No backend — 100% client-side
            </Badge>
          </div>
        </header>

        {/* ---------- cross-origin isolation warning ---------- */}
        {!crossOriginIsolated && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-medium text-destructive">This page is not cross-origin isolated.</p>
              <p className="mt-1 text-muted-foreground">
                The Wasmer runtime needs <code className="font-mono text-xs">SharedArrayBuffer</code>,
                which requires <code className="font-mono text-xs">Cross-Origin-Opener-Policy: same-origin</code> and{" "}
                <code className="font-mono text-xs">Cross-Origin-Embedder-Policy: require-corp</code>{" "}
                response headers. Serve the app with those headers (the included{" "}
                <code className="font-mono text-xs">next.config.ts</code> already sets them) and reload.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {/* ---------- step 1: pollen ---------- */}
          <StepCard
            index={1}
            title="Connect your Pollinations account"
            subtitle="Pi will spend your own Pollen on the model you pick — nothing is charged to the app."
            done={Boolean(pollen)}
          >
            {pollen ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pollen/25 bg-pollen/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pollen/15 text-pollen">
                    <Flower2 className="h-4.5 w-4.5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {pollen.user?.preferred_username ?? pollen.user?.name ?? "Connected"}
                      {pollen.source === "manual" && (
                        <span className="ml-2 text-xs text-muted-foreground">(API key)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {balance?.balance != null ? (
                        <>
                          Balance:{" "}
                          <span className="font-medium text-pollen">
                            {formatPollen(balance.balance)} Pollen
                          </span>
                        </>
                      ) : (
                        "Balance requires the usage scope"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefreshBalance}
                    aria-label="Refresh balance"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="outline" size="sm" onClick={onDisconnectPollen}>
                    <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full bg-pollen text-ink hover:bg-pollen/90 sm:w-auto"
                  onClick={onConnectOAuth}
                  disabled={!APP_KEY}
                >
                  <Flower2 className="mr-2 h-4 w-4" aria-hidden />
                  {APP_KEY ? "Connect Pollinations account" : "App Key not configured"}
                </Button>
                {!APP_KEY && (
                  <p className="text-xs text-muted-foreground">
                    Set <code className="font-mono">NEXT_PUBLIC_POLLINATIONS_APP_KEY</code> to your
                    publishable key (
                    <a
                      className="underline underline-offset-2 hover:text-foreground"
                      href="https://enter.pollinations.ai/keys"
                      target="_blank"
                      rel="noreferrer"
                    >
                      create one at enter.pollinations.ai
                    </a>
                    ) — or paste an API key below.
                  </p>
                )}
                <div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    onClick={() => setManualOpen((open) => !open)}
                  >
                    {manualOpen ? "Hide" : "Advanced: paste an API key instead"}
                  </button>
                  {manualOpen && (
                    <form
                      className="mt-3 flex flex-col gap-2 sm:flex-row"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const key = manualKey.trim();
                        if (!key.startsWith("sk_")) return;
                        setManualBusy(true);
                        try {
                          await onManualKey(key);
                          setManualKey("");
                          setManualOpen(false);
                        } finally {
                          setManualBusy(false);
                        }
                      }}
                    >
                      <Input
                        value={manualKey}
                        onChange={(event) => setManualKey(event.target.value)}
                        placeholder="sk_..."
                        type="password"
                        autoComplete="off"
                        className="font-mono text-xs"
                        aria-label="Pollinations API key"
                      />
                      <Button type="submit" variant="secondary" disabled={!manualKey.trim().startsWith("sk_") || manualBusy}>
                        {manualBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Use key"}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </StepCard>

          {/* ---------- step 2: model ---------- */}
          <StepCard
            index={2}
            title="Choose a model"
            subtitle="Any tool-calling Pollinations model works — switch later without losing the session."
            done={Boolean(selectedModel)}
          >
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models (gpt, claude, grok…)"
                className="pl-9"
                aria-label="Search models"
              />
            </div>
            {modelsError && (
              <p className="mb-3 text-xs text-muted-foreground">{modelsError}</p>
            )}
            <div className="slim-scroll max-h-80 space-y-2 overflow-y-auto pr-1" role="listbox" aria-label="Available models">
              {!models && (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading models…
                </div>
              )}
              {models &&
                filteredModels.map((model) => {
                  const selected = model.name === selectedModel;
                  const inPrice = pollenPerMillion(model.pricing?.promptTextTokens);
                  const outPrice = pollenPerMillion(model.pricing?.completionTextTokens);
                  return (
                    <button
                      key={model.name}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onSelectModel(model.name)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-pollen/60 bg-pollen/10"
                          : "border-border bg-card/40 hover:border-pollen/30 hover:bg-card/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {model.title ?? model.name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {model.name}
                          </p>
                        </div>
                        {selected && (
                          <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-pollen" aria-hidden />
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {model.publisher && <Badge variant="outline">{model.publisher}</Badge>}
                        {model.context_length != null && (
                          <Badge variant="outline">
                            {Math.round(model.context_length / 1000)}k ctx
                          </Badge>
                        )}
                        {model.tools && <Badge variant="outline">tools</Badge>}
                        {model.reasoning && <Badge variant="outline">reasoning</Badge>}
                        {inPrice && outPrice && (
                          <span title="Pollen per million tokens (in / out)">
                            {inPrice} / {outPrice} 🍯 per M
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              {models && !filteredModels.length && (
                <p className="p-3 text-sm text-muted-foreground">No models match “{search}”.</p>
              )}
            </div>
          </StepCard>

          {/* ---------- step 3: wisp ---------- */}
          <StepCard
            index={3}
            title="Network tunnel (WISP)"
            subtitle="Browsers can't open raw TCP sockets — Pi's API traffic is tunneled through a small WebSocket proxy you control."
            done={Boolean(wispUrl)}
          >
            {wispUrl ? (
              <div className="rounded-lg border border-pollen/25 bg-pollen/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <BadgeCheck className="h-4 w-4 text-pollen" aria-hidden /> Tunnel configured
                </p>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{wispUrl}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card/40 p-4">
                  <p className="text-sm font-medium">Option A · One-click (recommended)</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deploys the open-source <code className="font-mono">wasmer/wisp-server</code> to
                    your free Wasmer account. It auto-configures this tab afterwards. Needs a Wasmer
                    sign-in; the server keeps running for later visits.
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <a href={deployUrl ?? "https://wasmer.io/apps/create?package=wasmer/wisp-server"} target="_blank" rel="noreferrer">
                      Deploy WISP server <ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                    </a>
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-card/40 p-4">
                  <p className="text-sm font-medium">Option B · Run locally</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If you have the Wasmer CLI installed:
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-2.5 font-mono text-xs text-foreground">
{LOCAL_WISP_COMMAND}
                  </pre>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Then paste the printed <code className="font-mono">ws://localhost:…</code> URL
                    below.
                  </p>
                </div>
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = customWisp.trim();
                    if (value) onWispChosen(value);
                  }}
                >
                  <Input
                    value={customWisp}
                    onChange={(event) => setCustomWisp(event.target.value)}
                    placeholder="wss://your-wisp-server… (or ws://localhost:…)"
                    className="font-mono text-xs"
                    aria-label="WISP endpoint URL"
                  />
                  <Button type="submit" variant="secondary" disabled={!customWisp.trim()}>
                    Use endpoint
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  You can skip this now — the app will ask again the first time Pi needs the network.
                </p>
              </div>
            )}
          </StepCard>
        </div>

        {/* ---------- launch ---------- */}
        <div className="mt-8">
          {launching ? (
            <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-pollen" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {sandboxPhase === "downloading"
                      ? "Downloading the real Pi package…"
                      : sandboxPhase === "creating"
                        ? "Preparing your WASIX sandbox…"
                        : "Loading the Wasmer runtime…"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {downloadedMb ?? "Resolving packages…"}
                    <span className="ml-2">
                      (cached packages reload instantly on your next visit)
                    </span>
                  </p>
                  {launchPercent != null && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="progress-sheen h-full rounded-full bg-pollen transition-all"
                        style={{ width: `${launchPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={!canLaunch || !crossOriginIsolated}
              onClick={onLaunch}
              className="h-12 w-full bg-pollen text-base font-semibold text-ink hover:bg-pollen/90"
            >
              <Zap className="mr-2 h-5 w-5" aria-hidden />
              Launch the sandbox
            </Button>
          )}
          {!canLaunch && !launching && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Connect an account and pick a model to continue.
            </p>
          )}
        </div>

        <Separator className="my-10" />

        <footer className="space-y-2 text-center text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium text-foreground/90">
              Made With <span aria-hidden>❤️</span> By Naman
            </span>
            <span aria-hidden>•</span>
            <a
              href="https://github.com/NamanSoni78"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
            >
              <Github className="h-3 w-3" aria-hidden /> GitHub Account
            </a>
            <span aria-hidden>•</span>
            <a
              href="https://github.com/NamanSoni78/pi-browser-agent"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Open Source
            </a>
          </p>
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <span>Pi is an agent harness by</span>
            <a
              href="https://github.com/earendil-works/pi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
            >
              <Github className="h-3 w-3" aria-hidden /> earendil-works
            </a>
            <span>· sandbox by</span>
            <a
              href="https://wasmer.io"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Wasmer
            </a>
            <span>· models &amp; Pollen by</span>
            <a
              href="https://pollinations.ai"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Pollinations
            </a>
          </p>
          <p className="inline-flex items-center gap-1.5">
            <Terminal className="h-3 w-3" aria-hidden />
            Everything resets when you close or reload this tab.
          </p>
        </footer>
      </div>
    </div>
  );
}
