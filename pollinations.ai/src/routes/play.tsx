import { createFileRoute } from "@tanstack/react-router";

const PLAYGROUND_EMBED_SRC = "/_apps/playground/index.html?embed=1";

export const Route = createFileRoute("/play")({
    component: PlayRoute,
});

function PlayRoute() {
    return (
        <div data-theme="violet" className="bg-white">
            <iframe
                title="Pollinations Playground"
                src={PLAYGROUND_EMBED_SRC}
                className="block h-[calc(100vh-3.5rem)] min-h-[720px] w-full border-0 bg-white"
                allow="clipboard-read; clipboard-write; fullscreen"
            />
        </div>
    );
}
