import { createFileRoute, redirect } from "@tanstack/react-router";
import { Deployments } from "../components/community-endpoints";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-models")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: MyModelsPage,
});

function MyModelsPage() {
    const { communityEndpointsAllowed } = DashboardRoute.useLoaderData();
    return <Deployments canPublish={communityEndpointsAllowed} />;
}
