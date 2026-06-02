import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/apps")({
    component: () => (
        <div
            data-theme="blue"
            className="flex min-h-full items-center justify-center p-8 font-heading text-2xl text-theme-text-strong"
        >
            apps — coming soon
        </div>
    ),
});
