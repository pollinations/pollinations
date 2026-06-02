import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/apps")({
    component: () => (
        <div
            data-theme="blue"
            className="polli:flex polli:min-h-full polli:items-center polli:justify-center polli:p-8 polli:font-heading polli:text-2xl polli:text-theme-text-strong"
        >
            apps — coming soon
        </div>
    ),
});
