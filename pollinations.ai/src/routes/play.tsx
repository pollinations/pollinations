import { Button, ButtonGroup, Surface, TabButton } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ENTER_URL, POLLI_APP_KEY } from "../config.ts";

const PLAY_APPS = [
    {
        id: "playground",
        label: "Playground",
        title: "Pollinations Playground",
        src: "/_apps/playground/index.html?embed=1",
        appKey: POLLI_APP_KEY,
        permissions: ["profile", "usage"],
    },
    {
        id: "catgpt",
        label: "CatGPT",
        title: "CatGPT",
        src: "/_apps/catgpt/index.html?embed=1",
        appKey: "pk_uiTUS6epS9k5dLdr",
        permissions: ["profile", "usage"],
        models: ["gptimage", "nanobanana", "claude-fast"],
        budget: 5,
    },
] as const;

type PlayAppId = (typeof PLAY_APPS)[number]["id"];
type PlayApp = (typeof PLAY_APPS)[number];
type PlaySearch = {
    app?: PlayAppId;
};

function isPlayAppId(value: unknown): value is PlayAppId {
    return PLAY_APPS.some((app) => app.id === value);
}

function appTokenStorageKey(appKey: string): string {
    return `polli:${appKey}:token`;
}

function appStateStorageKey(appKey: string): string {
    return `polli:${appKey}:oauth_state`;
}

function hasAppToken(app: PlayApp): boolean {
    if (typeof window === "undefined") return false;
    return !!window.localStorage.getItem(appTokenStorageKey(app.appKey));
}

function authorizeApp(app: PlayApp): void {
    if (typeof window === "undefined") return;

    const state = crypto.randomUUID();
    window.localStorage.setItem(appStateStorageKey(app.appKey), state);

    const hubReturnUrl = new URL("/play", window.location.origin);
    hubReturnUrl.searchParams.set("app", app.id);

    const redirectUrl = new URL(app.src, window.location.origin);
    redirectUrl.searchParams.set(
        "hubReturn",
        `${hubReturnUrl.pathname}${hubReturnUrl.search}`,
    );

    const authorizeUrl = new URL("/authorize", ENTER_URL);
    authorizeUrl.searchParams.set("redirect_uri", redirectUrl.toString());
    authorizeUrl.searchParams.set("client_id", app.appKey);
    authorizeUrl.searchParams.set("state", state);
    if (app.permissions.length > 0) {
        authorizeUrl.searchParams.set("scope", app.permissions.join(" "));
    }
    if ("models" in app && app.models.length > 0) {
        authorizeUrl.searchParams.set("models", app.models.join(","));
    }
    if ("budget" in app) {
        authorizeUrl.searchParams.set("budget", String(app.budget));
    }

    window.location.href = authorizeUrl.toString();
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
    const selectedAppAuthorized = hasAppToken(selectedApp);

    const selectApp = (nextApp: PlayAppId) => {
        const next = PLAY_APPS.find((candidate) => candidate.id === nextApp);
        if (!next) return;
        if (!hasAppToken(next)) {
            authorizeApp(next);
            return;
        }
        navigate({ search: { app: nextApp } });
    };

    return (
        <div
            data-theme="violet"
            className="mx-auto flex max-w-5xl flex-col gap-5 bg-white px-4 py-10 sm:px-6"
        >
            <section className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                    <h1 className="flex flex-wrap gap-x-3 font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                        <span>Load</span>
                        <span>app</span>
                    </h1>
                    <p className="max-w-2xl font-body text-lg text-theme-text-base">
                        Open a focused Pollinations experience inside the Play
                        workspace.
                    </p>
                </div>
                <ButtonGroup aria-label="Load app">
                    {PLAY_APPS.map((playApp) => (
                        <TabButton
                            key={playApp.id}
                            active={selectedApp.id === playApp.id}
                            onClick={() => selectApp(playApp.id)}
                            theme="violet"
                        >
                            {playApp.label}
                        </TabButton>
                    ))}
                </ButtonGroup>
            </section>

            {selectedAppAuthorized ? (
                <div className="w-full bg-white">
                    <iframe
                        key={selectedApp.id}
                        title={selectedApp.title}
                        src={selectedApp.src}
                        className="block h-[calc(100vh-10rem)] min-h-[760px] w-full border-0 bg-white"
                        allow="clipboard-read; clipboard-write; fullscreen"
                    />
                </div>
            ) : (
                <Surface
                    theme="violet"
                    variant="panel"
                    className="flex min-h-[22rem] flex-col items-center justify-center gap-4 text-center"
                >
                    <div>
                        <h2 className="font-subheading text-xl text-theme-text-strong">
                            Authorize {selectedApp.label}
                        </h2>
                        <p className="mt-1 max-w-md text-sm text-theme-text-base">
                            This app uses its own BYOP key so usage and budgets
                            stay scoped to the selected experience.
                        </p>
                    </div>
                    <Button
                        type="button"
                        theme="violet"
                        onClick={() => authorizeApp(selectedApp)}
                    >
                        Authorize {selectedApp.label}
                    </Button>
                </Surface>
            )}
        </div>
    );
}
