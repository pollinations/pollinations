import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { Deployments } from "../components/community-endpoints";
import { DeploymentsPlaceholder } from "../components/community-endpoints/community-endpoints.tsx";
import { MyApps, SubmitAppButton } from "../components/my-apps.tsx";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-models")({
    // Agents is the default tab; Models and Apps are named in the address.
    validateSearch: (
        search: Record<string, unknown>,
    ): { tab?: "models" | "apps" } => ({
        tab:
            search.tab === "models" || search.tab === "apps"
                ? search.tab
                : undefined,
    }),
    beforeLoad: ({ context, location, search }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
        // My Models had Agents and Models sections; #models opened the second.
        if (location.hash === "models" && !search.tab) {
            throw redirect({
                to: "/my-models",
                search: { tab: "models" },
                replace: true,
            });
        }
    },
    component: MyModelsPage,
});

function MyModelsPage() {
    const retry = useDashboardRetry("profile");
    const retryApps = useDashboardRetry("apps");
    const { profile, apps, user } = useDeferredValue(
        DashboardRoute.useLoaderData(),
    );
    const githubConnected = Boolean(user?.githubId);
    const appsTab = {
        action: (
            <Await promise={apps} fallback={null}>
                {(listed) => (listed?.length ? <SubmitAppButton /> : null)}
            </Await>
        ),
        content: (
            <Await
                promise={apps}
                fallback={
                    <MyApps
                        apps={undefined}
                        githubConnected={githubConnected}
                        onRetry={retryApps}
                    />
                }
            >
                {(listed) => (
                    <MyApps
                        apps={listed}
                        githubConnected={githubConnected}
                        onRetry={retryApps}
                    />
                )}
            </Await>
        ),
    };
    return (
        <Await promise={profile} fallback={<DeploymentsPlaceholder />}>
            {(details) =>
                details ? (
                    <Deployments
                        canPublish={details.communityEndpointsAllowed}
                        appsTab={appsTab}
                    />
                ) : (
                    <DeploymentsPlaceholder
                        onRetry={retry}
                        error="Couldn’t load publisher details."
                    />
                )
            }
        </Await>
    );
}
