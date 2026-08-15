import { createFileRoute, redirect } from "@tanstack/react-router";
import { Deployments } from "../components/community-endpoints";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/deployments")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: DeploymentsPage,
});

function DeploymentsPage() {
    const { communityEndpointsAllowed } = DashboardRoute.useLoaderData();
    return <Deployments canPublish={communityEndpointsAllowed} />;
}
