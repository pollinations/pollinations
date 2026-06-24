import { cn, useColorMode } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

// /play embeds the Playground app, framed by the site's own page header (so it
// matches the other routes). The embed runs with `?embed=1`, which tells the app
// to hide its own header + color-mode toggle and report its content height. The
// site shares its color mode one-way (header toggle drives the embed) and sizes
// the iframe to the reported height so the iframe never scrolls — the page does.
//
// In dev we point at the local Playground (its `npm run dev` port) so app-side
// changes are visible on http://127.0.0.1:<vite>/play without deploying; prod
// embeds the deployed app.
const PLAYGROUND_SRC = import.meta.env.DEV
    ? "http://127.0.0.1:4179/?embed=1"
    : "https://playground.pollinations.ai/?embed=1";
const APP_ORIGIN = new URL(PLAYGROUND_SRC).origin;
const EMBED_SOURCE = "polli-embed";
// Safety cap so a misbehaving app can't request an unbounded iframe.
const MAX_IFRAME_HEIGHT = 20000;

export const Route = createFileRoute("/play")({
    component: PlayRoute,
});

function PlayRoute() {
    const { mode } = useColorMode();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [reportedHeight, setReportedHeight] = useState<number | null>(null);

    const pushTheme = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { source: EMBED_SOURCE, type: "theme", value: mode },
            APP_ORIGIN,
        );
    }, [mode]);

    // Push theme on mode change; answer the app's `app-ready` ping (late mount)
    // and track its reported content height to size the iframe.
    useEffect(() => {
        pushTheme();
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== APP_ORIGIN) return;
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data as {
                source?: unknown;
                type?: unknown;
                value?: unknown;
            } | null;
            if (data?.source !== EMBED_SOURCE) return;
            if (data.type === "app-ready") {
                pushTheme();
            } else if (
                data.type === "height" &&
                typeof data.value === "number" &&
                Number.isFinite(data.value) &&
                data.value > 0
            ) {
                setReportedHeight(Math.min(data.value, MAX_IFRAME_HEIGHT));
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [pushTheme]);

    return (
        <div className="flex w-full flex-col gap-6 pt-10 pb-10">
            <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 sm:px-6">
                <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                    Play
                </h1>
                <p className="font-body text-lg text-theme-text-base">
                    Run a Pollinations app live, right here.
                </p>
            </section>
            <iframe
                ref={iframeRef}
                title="Pollinations Playground"
                src={PLAYGROUND_SRC}
                onLoad={pushTheme}
                className={cn(
                    "block w-full border-0 bg-app-bg",
                    // Fallback height until the app reports its own; once it does
                    // we size to content so the iframe itself never scrolls.
                    reportedHeight === null &&
                        "h-[calc(100dvh-16rem)] min-h-[640px]",
                )}
                style={
                    reportedHeight !== null
                        ? { height: reportedHeight }
                        : undefined
                }
                allow="clipboard-read; clipboard-write; fullscreen"
            />
        </div>
    );
}
