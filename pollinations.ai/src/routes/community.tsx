import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/community")({
    component: () => (
        <div
            data-theme="pink"
            className="polli:flex polli:min-h-full polli:items-center polli:justify-center polli:p-8 polli:font-heading polli:text-2xl polli:text-theme-text-strong"
        >
            community — coming soon
        </div>
    ),
});
