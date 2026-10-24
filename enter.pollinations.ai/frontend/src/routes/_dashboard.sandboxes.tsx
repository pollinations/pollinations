import { createFileRoute, redirect } from "@tanstack/react-router";
import { Sandboxes } from "../components/sandboxes.tsx";

export const Route = createFileRoute("/_dashboard/sandboxes")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: Sandboxes,
});
