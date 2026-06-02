import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: () => (
        <div
            data-theme="green"
            className="flex min-h-full items-center justify-center p-8 font-heading text-2xl text-theme-text-strong"
        >
            pollinations.ai — rebuilding
        </div>
    ),
});
