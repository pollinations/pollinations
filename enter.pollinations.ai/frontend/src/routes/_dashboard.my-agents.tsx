import { createFileRoute, redirect } from "@tanstack/react-router";
import { DeploymentsPage } from "./_dashboard.my-models.tsx";

export const Route = createFileRoute("/_dashboard/my-agents")({
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: () => <DeploymentsPage kind="agents" />,
});
