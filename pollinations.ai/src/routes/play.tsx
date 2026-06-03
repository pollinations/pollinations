import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { ButtonGroup, TabButton } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/compositions/app-user";
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

function appModels(app: PlayApp): string[] | undefined {
    return "models" in app ? [...app.models] : undefined;
}

function appBudget(app: PlayApp): number | undefined {
    return "budget" in app ? app.budget : undefined;
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
        <PolliProvider
            key={selectedApp.appKey}
            appKey={selectedApp.appKey}
            enterUrl={ENTER_URL}
            permissions={[...selectedApp.permissions]}
            models={appModels(selectedApp)}
            budget={appBudget(selectedApp)}
        >
            <PlayHub selectedApp={selectedApp} onSelectApp={selectApp} />
        </PolliProvider>
    );
}

function PlayHub({
    selectedApp,
    onSelectApp,
}: {
    selectedApp: PlayApp;
    onSelectApp: (app: PlayAppId) => void;
}) {
    const { apiKey } = useAuthState();

    return (
        <div
            data-theme="violet"
            className="mx-auto flex max-w-5xl flex-col gap-5 bg-white px-4 py-10 sm:px-6"
        >
            <section className="flex flex-col gap-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex flex-col gap-3">
                        <h1 className="flex flex-wrap gap-x-3 font-heading text-4xl leading-none text-theme-text-strong sm:text-5xl">
                            <span>Load</span>
                            <span>app</span>
                        </h1>
                        <p className="max-w-2xl font-body text-lg text-theme-text-base">
                            Open a focused Pollinations experience inside the
                            Play workspace.
                        </p>
                    </div>
                </div>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <ButtonGroup aria-label="Load app">
                        {PLAY_APPS.map((playApp) => (
                            <TabButton
                                key={playApp.id}
                                active={selectedApp.id === playApp.id}
                                onClick={() => onSelectApp(playApp.id)}
                                theme="violet"
                            >
                                {playApp.label}
                            </TabButton>
                        ))}
                    </ButtonGroup>
                    <div className="shrink-0">
                        <AppUserMenu
                            dashboardHref={ENTER_URL}
                            labels={{
                                authorize: `Authorize ${selectedApp.label}`,
                            }}
                        />
                    </div>
                </div>
            </section>

            <div className="w-full bg-white">
                <iframe
                    key={`${selectedApp.id}:${apiKey ?? "logged-out"}`}
                    title={selectedApp.title}
                    src={selectedApp.src}
                    className="block h-[calc(100vh-10rem)] min-h-[760px] w-full border-0 bg-white"
                    allow="clipboard-read; clipboard-write; fullscreen"
                />
            </div>
        </div>
    );
}
