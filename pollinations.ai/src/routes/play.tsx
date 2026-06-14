import { ButtonGroup, cn, TabButton, useColorMode } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

const PLAY_APPS = [
    {
        id: "playground",
        label: "Playground",
        title: "Pollinations Playground",
        src: "https://playground.pollinations.ai/?embed=1",
    },
    {
        id: "websim",
        label: "Websim",
        title: "Websim",
        src: "https://websim.pollinations.ai/?embed=1",
    },
] as const;

/** Origins allowed to drive the iframe height via the embed contract. */
const ALLOWED_APP_ORIGINS = PLAY_APPS.map((app) => new URL(app.src).origin);
/** Safety cap so a misbehaving app can't request an unbounded iframe. */
const MAX_IFRAME_HEIGHT = 20000;

type PlayAppId = (typeof PLAY_APPS)[number]["id"];
type PlaySearch = {
    app?: PlayAppId;
};

function isPlayAppId(value: unknown): value is PlayAppId {
    return PLAY_APPS.some((app) => app.id === value);
}

export const Route = createFileRoute("/play")({
    validateSearch: (search: Record<string, unknown>): PlaySearch => ({
        app: isPlayAppId(search.app) ? search.app : undefined,
    }),
    component: PlayRoute,
});

function PlayRoute() {
    const { app } = Route.useSearch();
    const navigate = Route.useNavigate();
    const selectedAppId = app ?? "playground";
    const selectedApp =
        PLAY_APPS.find((candidate) => candidate.id === selectedAppId) ??
        PLAY_APPS[0];

    const selectApp = (nextApp: PlayAppId) => {
        navigate({ search: { app: nextApp } });
    };

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col bg-app-bg py-10">
            <section className="flex flex-col gap-5 px-4 sm:px-6">
                <div className="flex flex-col gap-3">
                    <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                        Play
                    </h1>
                    <p className="max-w-2xl font-body text-lg text-theme-text-base">
                        Run a Pollinations app live, right here.
                    </p>
                </div>
                <ButtonGroup aria-label="Play">
                    {PLAY_APPS.map((playApp) => (
                        <TabButton
                            key={playApp.id}
                            active={selectedApp.id === playApp.id}
                            onClick={() => selectApp(playApp.id)}
                        >
                            {playApp.label}
                        </TabButton>
                    ))}
                </ButtonGroup>
            </section>

            <AppFrame key={selectedApp.id} app={selectedApp} />
        </div>
    );
}

/**
 * Embedded apps post their content height so the iframe grows to fit (no inner
 * scroll), and the host pushes the site's current color mode back so an
 * already-open app re-themes live. Small local message contract shared with the
 * apps: `{ source: "polli-embed", type: "height" | "theme", value }`. Until a
 * height message arrives we fall back to a fixed viewport-based height — so apps
 * that don't emit behave as before. Keyed by app id so switching apps resets
 * cleanly.
 */
function AppFrame({ app }: { app: (typeof PLAY_APPS)[number] }) {
    const [reportedHeight, setReportedHeight] = useState<number | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { mode } = useColorMode();
    const appOrigin = new URL(app.src).origin;

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (!ALLOWED_APP_ORIGINS.includes(event.origin)) return;
            const data = event.data as {
                source?: unknown;
                type?: unknown;
                value?: unknown;
            } | null;
            if (
                !data ||
                data.source !== "polli-embed" ||
                data.type !== "height" ||
                typeof data.value !== "number" ||
                !Number.isFinite(data.value) ||
                data.value <= 0
            ) {
                return;
            }
            setReportedHeight(Math.min(data.value, MAX_IFRAME_HEIGHT));
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, []);

    // Push the site's current theme into the embed. Initial paint is already
    // handled by the shared cookie; this keeps an open app in sync when the
    // user toggles. Posted to the app's own origin only (dropped after the app
    // navigates the iframe to a different origin, e.g. the auth screen).
    const postTheme = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { source: "polli-embed", type: "theme", value: mode },
            appOrigin,
        );
    }, [mode, appOrigin]);

    useEffect(() => {
        postTheme();
    }, [postTheme]);

    return (
        <iframe
            ref={iframeRef}
            title={app.title}
            src={app.src}
            onLoad={postTheme}
            className={cn(
                "block w-full border-0 bg-app-bg",
                reportedHeight === null &&
                    "h-[calc(100vh-10rem)] min-h-[760px]",
            )}
            style={
                reportedHeight !== null ? { height: reportedHeight } : undefined
            }
            allow="clipboard-read; clipboard-write; fullscreen"
        />
    );
}
