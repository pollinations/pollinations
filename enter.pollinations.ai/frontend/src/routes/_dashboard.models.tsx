import { createFileRoute } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateModelSearch } from "../components/models/model-search.ts";
import { Route as DashboardRoute } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    component: ModelsPage,
});

function ModelsPage() {
    const { user, communityEndpointsAllowed } = DashboardRoute.useLoaderData();
    return (
        <Models
            showCommunityEndpoints={Boolean(user)}
            canPublish={communityEndpointsAllowed}
        />
    );
}
