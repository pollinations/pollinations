import { ColorModeToggle, cn, setColorMode } from "@pollinations/ui";
import {
    AppUserMenu,
    isEmbeddedContext,
} from "@pollinations/ui/app-user-menu/sdk";
import { useEffect } from "react";
import { ENTER_URL } from "./config";
import { Playground } from "./Playground";

// Origins allowed to push a live theme into this embedded app: the /play host
// and same-site siblings. Theme is cosmetic, but we still gate on origin.
function isTrustedHostOrigin(origin: string): boolean {
    try {
        const host = new URL(origin).hostname;
        return (
            host === "pollinations.ai" ||
            host.endsWith(".pollinations.ai") ||
            host === "localhost"
        );
    } catch {
        return false;
    }
}

export function App() {
    const isEmbedded = isEmbeddedContext();

    // Report content height to the embedding host (/play) so it can size the
    // iframe to fit — no inner scroll. Message: { source, type, value }.
    useEffect(() => {
        if (!isEmbedded || window.parent === window.self) return;
        const report = () => {
            window.parent.postMessage(
                {
                    source: "polli-embed",
                    type: "height",
                    value: Math.ceil(document.documentElement.scrollHeight),
                },
                "*",
            );
        };
        const observer = new ResizeObserver(report);
        observer.observe(document.body);
        report();
        return () => observer.disconnect();
    }, [isEmbedded]);

    // Apply a theme the host (/play) pushes when its toggle changes, so this
    // already-loaded embed re-themes live. Message: { source, type, value }.
    useEffect(() => {
        if (!isEmbedded || window.parent === window.self) return;
        const onMessage = (event: MessageEvent) => {
            if (!isTrustedHostOrigin(event.origin)) return;
            const data = event.data as {
                source?: unknown;
                type?: unknown;
                value?: unknown;
            } | null;
            if (
                !data ||
                data.source !== "polli-embed" ||
                data.type !== "theme"
            ) {
                return;
            }
            if (data.value === "dark" || data.value === "light") {
                setColorMode(data.value);
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [isEmbedded]);

    return (
        <div
            className={cn(
                "relative flex flex-col bg-app-bg font-body text-theme-text-base",
                !isEmbedded && "min-h-dvh",
            )}
        >
            <div
                className={cn(
                    "fixed right-4 z-40 flex items-center gap-2",
                    isEmbedded ? "top-2" : "top-4",
                )}
            >
                {!isEmbedded && <ColorModeToggle />}
                <AppUserMenu dashboardHref={ENTER_URL} />
            </div>
            <main
                className={cn(
                    "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pb-5 sm:px-6",
                    isEmbedded ? "pt-2" : "pt-16",
                )}
            >
                <Playground showTitle={!isEmbedded} />
            </main>
        </div>
    );
}
