import { PolliProvider } from "@pollinations/sdk/react";
import { ButtonGroup, cn, TabButton } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { type EmbedHost, useEmbedHost } from "../components/play/useEmbedHost";
import { ENTER_URL, POLLI_APP_KEY } from "../config";

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

/**
 * /play logs in at the site level (top-level, so OAuth works) and lends its key
 * down to the embedded app. PolliProvider holds the site's auth; `AppUserMenu`
 * is the site's own account control; `useEmbedHost` pushes the key to the app.
 */
function PlayRoute() {
    return (
        <PolliProvider appKey={POLLI_APP_KEY} enterUrl={ENTER_URL}>
            <PlayContent />
        </PolliProvider>
    );
}

function PlayContent() {
    const { app } = Route.useSearch();
    const navigate = Route.useNavigate();
    const selectedAppId = app ?? "playground";
    const selectedApp =
        PLAY_APPS.find((candidate) => candidate.id === selectedAppId) ??
        PLAY_APPS[0];

    const selectApp = (nextApp: PlayAppId) => {
        navigate({ search: { app: nextApp } });
    };

    const appOrigin = new URL(selectedApp.src).origin;
    const host = useEmbedHost(appOrigin);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col bg-app-bg py-10">
            <section className="flex flex-col gap-5 px-4 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-3">
                        <h1 className="font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                            Play
                        </h1>
                        <p className="max-w-2xl font-body text-lg text-theme-text-base">
                            Run a Pollinations app live, right here.
                        </p>
                    </div>
                    <AppUserMenu
                        dashboardHref={ENTER_URL}
                        labels={{ authorize: "Log in" }}
                    />
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

            <AppFrame key={selectedApp.id} app={selectedApp} host={host} />
        </div>
    );
}

/**
 * The embedded app. Sizing, the handshake, theme sync, and the auth key push all
 * live in `useEmbedHost`; this is just the iframe. Until a height message arrives
 * we fall back to a fixed viewport-based height — so apps that don't emit behave
 * as before.
 */
function AppFrame({
    app,
    host,
}: {
    app: (typeof PLAY_APPS)[number];
    host: EmbedHost;
}) {
    return (
        <iframe
            ref={host.iframeRef}
            title={app.title}
            src={app.src}
            onLoad={host.onLoad}
            className={cn(
                "block w-full border-0 bg-app-bg",
                host.reportedHeight === null &&
                    "h-[calc(100vh-10rem)] min-h-[760px]",
            )}
            style={
                host.reportedHeight !== null
                    ? { height: host.reportedHeight }
                    : undefined
            }
            allow="clipboard-read; clipboard-write; fullscreen"
        />
    );
}
