import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { Deployments } from "../components/community-endpoints";
import {
    type DeploymentKind,
    DeploymentsPlaceholder,
} from "../components/community-endpoints/community-endpoints.tsx";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-models")({
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: () => <DeploymentsPage kind="models" />,
});

export function DeploymentsPage({ kind }: { kind: DeploymentKind }) {
    const retry = useDashboardRetry("profile");
    const { profile } = useDeferredValue(DashboardRoute.useLoaderData());
    return (
        <Await
            promise={profile}
            fallback={<DeploymentsPlaceholder kind={kind} />}
        >
            {(details) =>
                details ? (
                    <Deployments
                        kind={kind}
                        canPublish={details.communityEndpointsAllowed}
                    />
                ) : (
                    <DeploymentsPlaceholder
                        kind={kind}
                        onRetry={retry}
                        error="Couldn’t load publisher details."
                    />
                )
            }
        </Await>
    );
}
