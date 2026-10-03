"use client";

/**
 * Main client orchestrator for Pi in the Browser.
 *
 * Owns the full lifecycle: BYO-Pollen OAuth, model selection, WISP endpoint,
 * the WASM sandbox, and the chat loop that drives the real Pi agent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  buildAuthJson,
  buildAuthorizeUrl,
  buildModelsJson,
  clearPersistedSession,
  completeOAuthFromUrl,
  fetchBalance,
  fetchModels,
  fetchUserInfo,
  FALLBACK_MODELS,
  loadPersistedSession,
  persistSession,
} from "@/lib/pollinations";
import {
  broadcastWispEndpoint,
  listenForWispAutoconfigure,
  readStoredWispUrl,
  storeWispUrl,
  wispUrlFromLocation,
} from "@/lib/wisp";
import {
  DEFAULT_APPEND_SYSTEM_MD,
  DEFAULT_STARTER_FILES,
  PiWorkspace,
  newSessionId,
} from "@/lib/pi-browser";
import type {
  LoadProgress,
  PollenBalance,
  PollinationsModel,
  PollenSession,
  SandboxPhase,
  Turn,
} from "@/lib/types";
import { Onboarding } from "@/components/pi/Onboarding";
import { WorkspaceView } from "@/components/pi/WorkspaceView";
import { WispDialog } from "@/components/pi/WispDialog";

export function PiApp() {
  const { toast } = useToast();

  // ---------- connection state ----------
  const [pollen, setPollen] = useState<PollenSession | null>(null);
  const [balance, setBalance] = useState<PollenBalance | null>(null);
  const [models, setModels] = useState<PollinationsModel[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [wispUrl, setWispUrl] = useState<string | null>(null);
  const [wispOpen, setWispOpen] = useState(false);
  const [crossOriginIsolated, setCrossOriginIsolated] = useState(true);

  // ---------- workspace state ----------
  const workspaceRef = useRef<PiWorkspace | null>(null);
  const [phase, setPhase] = useState<"onboarding" | "workspace">("onboarding");
  const [sandboxPhase, setSandboxPhase] = useState<SandboxPhase>("idle");
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState(() => newSessionId());
  const [filesVersion, setFilesVersion] = useState(0);
  const [running, setRunning] = useState(false);

  // Deferred resolver for the SDK's lazy WISP request callback.
  const wispResolveRef = useRef<((url: string) => void) | null>(null);
  const wispRejectRef = useRef<((error: Error) => void) | null>(null);

  // ---------- boot: OAuth callback, wisp autoconfigure, persisted state ----------
  useEffect(() => {
    setCrossOriginIsolated(window.crossOriginIsolated === true);

    // 1) OAuth redirect back into this page (?code= / ?error=)
    completeOAuthFromUrl()
      .then(async (result) => {
        if (!result) return;
        result.cleanUp();
        setPollen(result.session);
        persistSession(result.session);
        toast({
          title: "Pollinations connected",
          description: result.session.user?.preferred_username
            ? `Signed in as ${result.session.user.preferred_username}. Your Pollen, your models.`
            : "Your Pollen will be spent on your chosen model.",
        });
      })
      .catch((error: Error) => {
        toast({ title: "Authorization failed", description: error.message, variant: "destructive" });
      });

    // 2) WISP autoconfigure (?endpoint=wss://... opened by the deployed wisp-server)
    const fromLocation = wispUrlFromLocation();
    if (fromLocation) {
      fromLocation.cleanUp();
      if (fromLocation.url) {
        storeWispUrl(fromLocation.url);
        setWispUrl(fromLocation.url);
        broadcastWispEndpoint(fromLocation.url);
        toast({ title: "WISP proxy configured", description: "Network tunnel ready." });
      }
    }

    // 3) Restored session + stored WISP endpoint
    const persisted = loadPersistedSession();
    if (persisted) setPollen(persisted);
    setWispUrl(readStoredWispUrl());

    // 4) Cross-tab autoconfigure listener
    const stop = listenForWispAutoconfigure((url) => {
      storeWispUrl(url);
      setWispUrl(url);
      workspaceRef.current?.setWispUrl(url);
      toast({ title: "WISP proxy configured", description: "Network tunnel ready." });
    });
    return stop;
  }, [toast]);

  // ---------- models + balance fetching ----------
  useEffect(() => {
    let cancelled = false;
    fetchModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list.length ? list : FALLBACK_MODELS);
      })
      .catch(() => {
        if (cancelled) return;
        setModels(FALLBACK_MODELS);
        setModelsError("Live model list unavailable — showing known-good fallback models.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pollen?.apiKey) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    fetchBalance(pollen.apiKey)
      .then((info) => {
        if (!cancelled) setBalance({ balance: info.balance, fetchedAt: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setBalance({ balance: null, fetchedAt: Date.now() });
      });
    return () => {
      cancelled = true;
    };
  }, [pollen?.apiKey]);

  const refreshBalance = useCallback(async () => {
    if (!pollen?.apiKey) return;
    try {
      const info = await fetchBalance(pollen.apiKey);
      setBalance({ balance: info.balance, fetchedAt: Date.now() });
    } catch {
      setBalance({ balance: null, fetchedAt: Date.now() });
    }
  }, [pollen?.apiKey]);

  // ---------- WISP request plumbing ----------
  const requestWispUrl = useCallback(async (): Promise<string> => {
    const stored = readStoredWispUrl();
    if (stored) return stored;
    return new Promise<string>((resolve, reject) => {
      wispResolveRef.current = resolve;
      wispRejectRef.current = reject;
      setWispOpen(true);
    });
  }, []);

  const handleWispChosen = useCallback(
    (url: string) => {
      const stored = storeWispUrl(url);
      if (!stored) return;
      setWispUrl(stored);
      workspaceRef.current?.setWispUrl(stored);
      setWispOpen(false);
      wispResolveRef.current?.(stored);
      wispResolveRef.current = null;
      wispRejectRef.current = null;
      toast({ title: "WISP proxy configured", description: "Network tunnel ready." });
    },
    [toast]
  );

  const handleWispDismiss = useCallback(() => {
    setWispOpen(false);
    if (wispRejectRef.current) {
      wispRejectRef.current(new Error("No WISP endpoint configured."));
      wispResolveRef.current = null;
      wispRejectRef.current = null;
    }
  }, []);

  // ---------- sandbox lifecycle ----------
  const startWorkspace = useCallback(async () => {
    if (!pollen || !selectedModel || !models) return;
    const workspace = new PiWorkspace();
    workspaceRef.current = workspace;
    setSandboxPhase("loading-sdk");
    setLoadProgress(null);
    try {
      const chosen = models.find((m) => m.name === selectedModel) ?? models[0];
      await workspace.start({
        wispUrl: wispUrl ?? undefined,
        requestWispUrl,
        modelsJson: buildModelsJson([chosen]),
        authJson: buildAuthJson(pollen.apiKey),
        appendSystemMd: DEFAULT_APPEND_SYSTEM_MD,
        starterFiles: DEFAULT_STARTER_FILES,
        onProgress: (progress) => {
          setLoadProgress(progress);
          if (progress.phase === "downloading") setSandboxPhase("downloading");
          else if (progress.phase === "loading") setSandboxPhase("creating");
        },
      });
      setSandboxPhase("ready");
      setPhase("workspace");
      setFilesVersion((v) => v + 1);
    } catch (error) {
      setSandboxPhase("error");
      toast({
        title: "Could not start the sandbox",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [pollen, selectedModel, models, wispUrl, requestWispUrl, toast]);

  const restartWorkspace = useCallback(async () => {
    const workspace = workspaceRef.current;
    if (workspace) await workspace.dispose();
    workspaceRef.current = null;
    setTurns([]);
    setSessionId(newSessionId());
    setPhase("onboarding");
    setSandboxPhase("idle");
    setLoadProgress(null);
  }, []);

  // ---------- model switching on a live sandbox ----------
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace?.ready || !pollen || !selectedModel || !models) return;
    const chosen = models.find((m) => m.name === selectedModel);
    if (!chosen) return;
    void workspace
      .applyCredentials(buildModelsJson([chosen]), buildAuthJson(pollen.apiKey))
      .catch(() => undefined);
  }, [selectedModel, pollen, models]);

  // ---------- chat ----------
  const sendPrompt = useCallback(
    async (prompt: string) => {
      const workspace = workspaceRef.current;
      if (!workspace?.ready || !selectedModel) return;
      setRunning(true);
      try {
        const turn = await workspace.runPrompt({
          prompt,
          modelId: selectedModel,
          sessionId,
          onEvent: (updated) => {
            setTurns((current) => {
              const next = [...current];
              const index = next.findIndex((t) => t.id === updated.id);
              if (index === -1) next.push(updated);
              else next[index] = updated;
              return next;
            });
          },
        });
        if (turn.state === "error") {
          toast({
            title: "Pi run failed",
            description: (turn.errorText ?? "").slice(0, 300) || "See the turn details.",
            variant: "destructive",
          });
        }
      } finally {
        setRunning(false);
        setFilesVersion((v) => v + 1);
      }
    },
    [selectedModel, sessionId, toast]
  );

  const cancelRun = useCallback(async () => {
    await workspaceRef.current?.cancelActiveRun();
  }, []);

  const newChat = useCallback(() => {
    if (running) return;
    setTurns([]);
    setSessionId(newSessionId());
  }, [running]);

  const disconnectPollen = useCallback(() => {
    clearPersistedSession();
    setPollen(null);
    setBalance(null);
  }, []);

  const connectOAuth = useCallback(() => {
    buildAuthorizeUrl()
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((error: Error) => {
        toast({ title: "Cannot start authorization", description: error.message, variant: "destructive" });
      });
  }, [toast]);

  const connectManualKey = useCallback(
    async (key: string) => {
      try {
        const info = await fetchBalance(key);
        const session: PollenSession = { apiKey: key, source: "manual" };
        session.user = await fetchUserInfo(key).catch(() => undefined);
        setPollen(session);
        persistSession(session);
        setBalance({ balance: info.balance, fetchedAt: Date.now() });
        toast({ title: "API key accepted", description: "Your Pollen will be spent on your chosen model." });
      } catch (error) {
        toast({
          title: "Key rejected",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        throw error;
      }
    },
    [toast]
  );

  const selectedModelInfo = useMemo(
    () => models?.find((m) => m.name === selectedModel) ?? null,
    [models, selectedModel]
  );

  return (
    <div className="relative flex min-h-screen flex-col">
      {phase === "onboarding" ? (
        <Onboarding
          pollen={pollen}
          balance={balance}
          models={models}
          modelsError={modelsError}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          wispUrl={wispUrl}
          onWispChosen={handleWispChosen}
          crossOriginIsolated={crossOriginIsolated}
          sandboxPhase={sandboxPhase}
          loadProgress={loadProgress}
          canLaunch={Boolean(pollen && selectedModel)}
          launching={
            sandboxPhase === "loading-sdk" || sandboxPhase === "downloading" || sandboxPhase === "creating"
          }
          onLaunch={() => void startWorkspace()}
          onConnectOAuth={connectOAuth}
          onManualKey={connectManualKey}
          onDisconnectPollen={disconnectPollen}
          onRefreshBalance={() => void refreshBalance()}
        />
      ) : (
        <WorkspaceView
          pollen={pollen}
          balance={balance}
          onRefreshBalance={() => void refreshBalance()}
          selectedModel={selectedModelInfo}
          models={models}
          onChangeModel={setSelectedModel}
          wispUrl={wispUrl}
          sessionId={sessionId}
          turns={turns}
          running={running}
          filesVersion={filesVersion}
          onSend={(prompt) => void sendPrompt(prompt)}
          onCancel={() => void cancelRun()}
          onNewChat={newChat}
          onRestart={() => void restartWorkspace()}
          onOpenWispSetup={() => setWispOpen(true)}
          workspace={workspaceRef.current}
        />
      )}

      <WispDialog open={wispOpen} onChoose={handleWispChosen} onDismiss={handleWispDismiss} />
    </div>
  );
}
