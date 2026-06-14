import { ButtonGroup, TabButton } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";

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
                        >
                            {playApp.label}
                        </TabButton>
                    ))}
                </ButtonGroup>
            </section>

            <iframe
                key={selectedApp.id}
                title={selectedApp.title}
                src={selectedApp.src}
                className="block h-[calc(100vh-10rem)] min-h-[760px] w-full border-0 bg-app-bg"
                allow="clipboard-read; clipboard-write; fullscreen"
            />
        </div>
    );
}
