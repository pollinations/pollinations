import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { Deployments } from "../components/community-endpoints";
import { DeploymentsPlaceholder } from "../components/community-endpoints/community-endpoints.tsx";
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
    const { profile } = useDeferredValue(DashboardRoute.useLoaderData());
    return (
        <Await promise={profile} fallback={<DeploymentsPlaceholder />}>
            {(details) =>
                details ? (
                    <Deployments
                        canPublish={details.communityEndpointsAllowed}
                    />
                ) : (
                    <DeploymentsPlaceholder error="Couldn’t load publisher details." />
                )
            }
        </Await>
    );
}
