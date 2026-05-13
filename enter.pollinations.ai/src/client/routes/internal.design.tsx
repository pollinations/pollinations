import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/internal/design")({
    beforeLoad: () => {
        if (!import.meta.env.DEV) {
            throw redirect({ to: "/" });
        }
    },
});
