import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { AppOverview } from "../components/app-overview.tsx";
import { Deployments } from "../components/community-endpoints";
import { DeploymentsPlaceholder } from "../components/community-endpoints/community-endpoints.tsx";
import {
    ListingFootnote,
    MyApps,
    SubmitAppButton,
} from "../components/my-apps.tsx";
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
    const { profile, apps, apiKeys, user } = useDeferredValue(
        DashboardRoute.useLoaderData(),
    );
    const githubConnected = Boolean(user?.githubId);
    const loading = (
        <MyApps
            apps={undefined}
            githubConnected={githubConnected}
            onRetry={retryApps}
        />
    );
    const appsTab = {
        action: <SubmitAppButton />,
        content: (
            <Await promise={apps} fallback={loading}>
                {(listed) =>
                    listed ? (
                        <Await promise={apiKeys} fallback={loading}>
                            {(keys) => (
                                <AppOverview
                                    apps={listed}
                                    appKeys={keys ?? []}
                                    footnote={
                                        <ListingFootnote
                                            githubConnected={githubConnected}
                                        />
                                    }
                                />
                            )}
                        </Await>
                    ) : (
                        <MyApps
                            apps={null}
                            githubConnected={githubConnected}
                            onRetry={retryApps}
                        />
                    )
                }
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
