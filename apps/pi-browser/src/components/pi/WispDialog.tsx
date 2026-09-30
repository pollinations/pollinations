"use client";

/**
 * The WISP endpoint dialog: shown when the sandbox needs a network tunnel and
 * none is configured (or the current one failed).
 */

import { useState } from "react";
import { Cloud, Server, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LOCAL_WISP_COMMAND,
  createWispDeploymentUrl,
} from "@/lib/wisp";

interface WispDialogProps {
  open: boolean;
  onChoose: (url: string) => void;
  onDismiss: () => void;
  error?: string;
  previousUrl?: string;
}

export function WispDialog({ open, onChoose, onDismiss, error, previousUrl }: WispDialogProps) {
  const [custom, setCustom] = useState("");
  // The deploy URL depends on window.location; the dialog only ever opens from
  // a client interaction, so computing it during render (guarded for SSR) is
  // safe and avoids an effect-driven setState.
  const deployUrl =
    typeof window === "undefined" ? null : createWispDeploymentUrl();

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onDismiss())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Network tunnel needed</DialogTitle>
          <DialogDescription>
            {error
              ? `The current tunnel failed (${error}). Pi's HTTPS traffic to gen.pollinations.ai is tunneled through a small WebSocket proxy (WISP) — pick one below.`
              : "Browsers cannot open raw TCP sockets, so Pi's HTTPS traffic to gen.pollinations.ai is tunneled through a small WebSocket proxy (WISP) that you control. Pick an option below."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Cloud className="h-4 w-4 text-pollen" aria-hidden /> One-click deploy (recommended)
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Deploys the open-source <code className="font-mono">wasmer/wisp-server</code> to your
              free Wasmer account. This tab picks up the endpoint automatically once it's live.
              {previousUrl && (
                <>
                  {" "}Previously used: <code className="font-mono">{previousUrl}</code>
                </>
              )}
            </p>
            <Button asChild size="sm" className="mt-3">
              <a
                href={deployUrl ?? "https://wasmer.io/apps/create?package=wasmer/wisp-server"}
                target="_blank"
                rel="noreferrer"
              >
                Deploy to Wasmer
              </a>
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4 text-pollen" aria-hidden /> Run locally
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              With the Wasmer CLI installed, run this and paste the printed URL below:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-ink p-2.5 font-mono text-xs">
{LOCAL_WISP_COMMAND}
            </pre>
          </div>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const value = custom.trim();
              if (value) onChoose(value);
            }}
          >
            <Input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="ws://localhost:… or wss://…"
              className="font-mono text-xs"
              aria-label="WISP endpoint URL"
            />
            <Button type="submit" variant="secondary" disabled={!custom.trim()}>
              <Server className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Use endpoint
            </Button>
          </form>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
