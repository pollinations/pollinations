import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/play")({
    component: () => (
        <div
            data-theme="violet"
            className="flex min-h-full items-center justify-center p-8 font-heading text-2xl text-theme-text-strong"
        >
            play — coming soon
        </div>
    ),
});
