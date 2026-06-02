import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/community")({
    component: () => (
        <div
            data-theme="pink"
            className="flex min-h-full items-center justify-center p-8 font-heading text-2xl text-theme-text-strong"
        >
            community — coming soon
        </div>
    ),
});
