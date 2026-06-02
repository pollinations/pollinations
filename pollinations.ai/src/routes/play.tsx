import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/play")({
    component: () => (
        <div
            data-theme="violet"
            className="polli:flex polli:min-h-full polli:items-center polli:justify-center polli:p-8 polli:font-heading polli:text-2xl polli:text-theme-text-strong"
        >
            play — coming soon
        </div>
    ),
});
