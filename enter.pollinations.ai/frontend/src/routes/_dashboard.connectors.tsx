import { createFileRoute, redirect } from "@tanstack/react-router";
import { ConnectedApps } from "../components/account/connected-apps.tsx";

export const Route = createFileRoute("/_dashboard/connectors")({
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: ConnectedApps,
});
