import { ButtonGroup, TabButton } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";

const PLAY_APPS = [
    {
        id: "playground",
        label: "Playground",
        title: "Pollinations Playground",
        src: "/_apps/playground/index.html?embed=1",
    },
    {
        id: "catgpt",
        label: "CatGPT",
        title: "CatGPT",
        src: "/_apps/catgpt/index.html?embed=1",
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
        <div data-theme="violet" className="bg-white">
            <section className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 sm:px-6">
                <h1 className="font-subheading text-xl text-gray-950">
                    Load app
                </h1>
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

            <div className="mx-auto w-full max-w-6xl bg-white">
                <iframe
                    key={selectedApp.id}
                    title={selectedApp.title}
                    src={selectedApp.src}
                    className="block h-[calc(100vh-10rem)] min-h-[760px] w-full border-0 bg-white"
                    allow="clipboard-read; clipboard-write; fullscreen"
                />
            </div>
        </div>
    );
}
