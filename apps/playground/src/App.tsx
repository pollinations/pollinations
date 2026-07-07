import { ColorModeToggle, cn, setColorMode } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { useEffect, useState } from "react";
import { ENTER_URL } from "./config";
import { Playground } from "./Playground";

const EMBED_SOURCE = "polli-embed";

// True when running inside pollinations.ai/play (`?embed=1`). The host then owns
// the color mode and sizes us to content: we hide our own toggle + header and
// report our height instead of scrolling internally.
function useIsEmbedded(): boolean {
    const [embedded] = useState(
        () =>
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("embed") === "1",
    );
    return embedded;
}

// Origin of the page that embedded us (the host), derived from the referrer so
// outgoing messages target a specific origin rather than "*".
function hostOrigin(): string | null {
    try {
        return document.referrer ? new URL(document.referrer).origin : null;
    } catch {
        return null;
    }
}

// Follow the host's color mode. Announce readiness on mount so the host pushes
// the current theme even if it mounted first; then apply every `theme` message.
function useHostTheme(embedded: boolean): void {
    useEffect(() => {
        if (!embedded || typeof window === "undefined") return;
        const onMessage = (event: MessageEvent) => {
            if (event.source !== window.parent) return;
            const data = event.data as {
                source?: unknown;
                type?: unknown;
                value?: unknown;
            } | null;
            if (data?.source !== EMBED_SOURCE || data.type !== "theme") return;
            if (data.value === "light" || data.value === "dark") {
                setColorMode(data.value);
            }
        };
        window.addEventListener("message", onMessage);
        const origin = hostOrigin();
        if (origin) {
            window.parent.postMessage(
                { source: EMBED_SOURCE, type: "app-ready" },
                origin,
            );
        }
        return () => window.removeEventListener("message", onMessage);
    }, [embedded]);
}

// Report our content height to the host so it can size the iframe to fit — no
// inner scroll; the page scrolls when content exceeds the viewport. Tracks live
// changes (content load, mode switch, resize) via ResizeObserver.
function useReportHeight(embedded: boolean): void {
    useEffect(() => {
        if (!embedded || typeof window === "undefined") return;
        const origin = hostOrigin();
        if (!origin) return;
        const post = () => {
            const height = document.documentElement.scrollHeight;
            if (height > 0) {
                window.parent.postMessage(
                    { source: EMBED_SOURCE, type: "height", value: height },
                    origin,
                );
            }
        };
        const observer = new ResizeObserver(post);
        observer.observe(document.body);
        post();
        return () => observer.disconnect();
    }, [embedded]);
}

export function App() {
    const embedded = useIsEmbedded();
    useHostTheme(embedded);
    useReportHeight(embedded);

    return (
        <div
            className={cn(
                "relative flex flex-col bg-app-bg font-body text-theme-text-base",
                // Embedded: size to content (host sizes the iframe). Standalone:
                // always fill the viewport.
                !embedded && "min-h-dvh",
            )}
        >
            <div className="fixed top-4 right-4 z-40 flex items-center gap-2">
                {!embedded && <ColorModeToggle />}
                <AppUserMenu dashboardHref={ENTER_URL} />
            </div>
            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-16 pb-5 sm:px-6">
                <Playground showHeader={!embedded} />
            </main>
        </div>
    );
}
