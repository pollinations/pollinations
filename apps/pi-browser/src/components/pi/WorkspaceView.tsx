"use client";

/**
 * The main workspace: status bar, agent chat (left), live file tree (right).
 */

import { useState } from "react";
import {
  Battery,
  Flower2,
  FolderTree,
  MessageSquare,
  Network,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPollen } from "@/lib/pollinations";
import type {
  PollenBalance,
  PollenSession,
  PollinationsModel,
  Turn,
} from "@/lib/types";
import type { PiWorkspace } from "@/lib/pi-browser";
import { ChatPanel } from "@/components/pi/ChatPanel";
import { FilesPanel } from "@/components/pi/FilesPanel";

interface WorkspaceViewProps {
  pollen: PollenSession | null;
  balance: PollenBalance | null;
  onRefreshBalance: () => void;
  selectedModel: PollinationsModel | null;
  models: PollinationsModel[] | null;
  onChangeModel: (id: string) => void;
  wispUrl: string | null;
  sessionId: string;
  turns: Turn[];
  running: boolean;
  filesVersion: number;
  onSend: (prompt: string) => void;
  onCancel: () => void;
  onNewChat: () => void;
  onRestart: () => void;
  onOpenWispSetup: () => void;
  workspace: PiWorkspace | null;
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const {
    pollen,
    balance,
    onRefreshBalance,
    selectedModel,
    models,
    onChangeModel,
    wispUrl,
    sessionId,
    turns,
    running,
    filesVersion,
    onSend,
    onCancel,
    onNewChat,
    onRestart,
    onOpenWispSetup,
    workspace,
  } = props;

  const [mobileTab, setMobileTab] = useState<"chat" | "files">("chat");

  return (
    <div className="flex h-svh flex-col">
      {/* ---------- status bar ---------- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/60 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pollen/15 text-pollen">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold leading-tight">
              Pi in the Browser
            </p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              pi v0.87.1 · wasmer WASIX · {sessionId}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* model switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-[150px] gap-1.5 sm:max-w-[220px]">
                <span className="truncate">
                  {selectedModel?.title ?? selectedModel?.name ?? "model"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="slim-scroll max-h-96 w-72 overflow-y-auto">
              <DropdownMenuLabel>Pollinations models</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(models ?? []).slice(0, 36).map((model) => (
                <DropdownMenuItem
                  key={model.name}
                  onClick={() => onChangeModel(model.name)}
                  className={model.name === selectedModel?.name ? "bg-pollen/10" : undefined}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{model.title ?? model.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {model.name}
                    </p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* pollen balance */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshBalance}
            title="Refresh Pollen balance"
            className="gap-1.5"
          >
            <Flower2 className="h-3.5 w-3.5 text-pollen" aria-hidden />
            <span className="font-mono text-xs">{formatPollen(balance?.balance)}</span>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">🍯</span>
          </Button>

          {/* wisp status */}
          <Button
            variant={wispUrl ? "outline" : "secondary"}
            size="sm"
            onClick={onOpenWispSetup}
            title={wispUrl ? `Tunnel: ${wispUrl}` : "Configure the network tunnel"}
            className="gap-1.5"
          >
            <Network className={`h-3.5 w-3.5 ${wispUrl ? "text-pollen" : "text-muted-foreground"}`} aria-hidden />
            <span className="hidden sm:inline">{wispUrl ? "tunnel" : "no tunnel"}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={onNewChat} disabled={running} title="Start a fresh conversation">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:ml-1.5 sm:inline">New chat</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart} title="Restart the sandbox (resets the workspace)">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:ml-1.5 sm:inline">Restart</span>
          </Button>
        </div>
      </header>

      {/* ---------- mobile tab switcher ---------- */}
      <div className="flex shrink-0 border-b sm:hidden" role="tablist" aria-label="Workspace panels">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "chat"}
          onClick={() => setMobileTab("chat")}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium ${
            mobileTab === "chat" ? "border-b-2 border-pollen text-foreground" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" aria-hidden /> Agent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "files"}
          onClick={() => setMobileTab("files")}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium ${
            mobileTab === "files" ? "border-b-2 border-pollen text-foreground" : "text-muted-foreground"
          }`}
        >
          <FolderTree className="h-4 w-4" aria-hidden /> Files
        </button>
      </div>

      {/* ---------- main split ---------- */}
      <main className="flex min-h-0 flex-1">
        <div className={`${mobileTab === "chat" ? "flex" : "hidden"} min-w-0 flex-1 sm:flex`}>
          <ChatPanel
            turns={turns}
            running={running}
            onSend={onSend}
            onCancel={onCancel}
            selectedModel={selectedModel}
          />
        </div>
        <aside
          className={`${mobileTab === "files" ? "flex" : "hidden"} w-full shrink-0 border-l sm:flex sm:w-[340px] lg:w-[380px]`}
        >
          <FilesPanel workspace={workspace} filesVersion={filesVersion} />
        </aside>
      </main>

      {/* ---------- footer strip ---------- */}
      <footer className="flex h-8 shrink-0 items-center justify-between gap-2 border-t bg-card/40 px-3 text-[11px] text-muted-foreground sm:px-4">
        <span className="hidden min-w-0 items-center gap-1.5 sm:inline-flex">
          <Battery className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Everything runs in this tab — the sandbox resets on reload.</span>
        </span>
        <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5">
          <span className="hidden items-center gap-1.5 md:inline-flex">
            {pollen?.user?.preferred_username && <span>{pollen.user.preferred_username} ·</span>}
            <span>BYO Pollen ·</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span>Made With ❤️ By Naman</span>
            <span aria-hidden>•</span>
            <a
              href="https://github.com/NamanSoni78"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              GitHub Account
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
          </span>
        </span>
      </footer>
    </div>
  );
}
