import { createFileRoute, redirect } from "@tanstack/react-router";
import { Deployments } from "../components/community-endpoints";
import { Route as DashboardRoute } from "./_dashboard.tsx";
export const Route = createFileRoute("/_dashboard/agents")({
    beforeLoad: ({ context, location }) => {
        if (!context.user)
            throw redirect({ to: "/sign-in", search: { next: location.href } });
    },
    component: AgentsPage,
});
function AgentsPage() {
    const { communityEndpointsAllowed } = DashboardRoute.useLoaderData();
    return <Deployments kind="agents" canPublish={communityEndpointsAllowed} />;
}
