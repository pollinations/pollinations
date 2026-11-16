import {
    Await,
    createFileRoute,
    redirect,
    useRouter,
} from "@tanstack/react-router";
import { useDeferredValue, useMemo } from "react";
import { accountClient } from "../api.ts";
import { Deployments } from "../components/community-endpoints";
import { DeploymentsPlaceholder } from "../components/community-endpoints/community-endpoints.tsx";
import { readError } from "../components/community-endpoints/types.ts";
import { MyApps, SubmitAppButton } from "../components/my-apps.tsx";
import { createKeyWithPermissions } from "../lib/create-api-key.ts";
import { updateApiKey } from "../lib/update-api-key.ts";
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
    const router = useRouter();
    const { profile, apps, apiKeys, earnings, user } = useDeferredValue(
        DashboardRoute.useLoaderData(),
    );
    const githubConnected = Boolean(user?.githubId);
    const appsData = useMemo(
        () => Promise.all([apps, apiKeys, earnings]),
        [apps, apiKeys, earnings],
    );
    const refresh = () =>
        router.invalidate({
            filter: (match) => match.routeId === DashboardRoute.id,
            sync: true,
        });
    const appsTab = {
        action: (
            <Await promise={apps} fallback={null}>
                {(listed) => (listed?.length ? <SubmitAppButton /> : null)}
            </Await>
        ),
        content: (
            <Await
                promise={appsData}
                fallback={
                    <MyApps
                        apps={undefined}
                        apiKeys={[]}
                        earnedByKey={new Map()}
                        githubConnected={githubConnected}
                        onRetry={retryApps}
                        onUpdateApp={async () => {}}
                        onUpdateKey={async () => {}}
                        onCreateKey={async () => {}}
                        onDeleteKey={async () => {}}
                        onDeleteApp={async () => {}}
                    />
                }
            >
                {([listed, keys, earned]) => (
                    <MyApps
                        apps={listed}
                        apiKeys={keys ?? []}
                        earnedByKey={
                            new Map(
                                earned?.perEntity.map((row) => [
                                    row.entity_id,
                                    row.paid_earned + row.tier_earned,
                                ]),
                            )
                        }
                        githubConnected={githubConnected}
                        onRetry={retryApps}
                        onUpdateApp={async (id, changes) => {
                            const response = await accountClient.apps[
                                ":id"
                            ].$patch({ param: { id }, json: changes });
                            if (!response.ok) {
                                throw new Error(await readError(response));
                            }
                            await refresh();
                        }}
                        onUpdateKey={async (id, updates) => {
                            await updateApiKey(id, updates);
                            await refresh();
                        }}
                        onCreateKey={async (key) => {
                            await createKeyWithPermissions({
                                ...key,
                                prefix: "pk",
                            });
                            await refresh();
                        }}
                        onDeleteKey={async (id) => {
                            const response = await accountClient.keys[
                                ":id"
                            ].$delete({ param: { id } });
                            if (!response.ok) {
                                throw new Error(await readError(response));
                            }
                            await refresh();
                        }}
                        onDeleteApp={async (id) => {
                            const response = await accountClient.apps[
                                ":id"
                            ].$delete({ param: { id } });
                            if (!response.ok) {
                                throw new Error(await readError(response));
                            }
                            await refresh();
                        }}
                    />
                )}
            </Await>
        ),
    };
    return (
        <Await promise={profile} fallback={<DeploymentsPlaceholder />}>
            {(details) => (
                // Without the profile, Agents and Models show its error; the
                // Apps tab doesn't need it.
                <Deployments
                    canPublish={details?.communityEndpointsAllowed ?? null}
                    onProfileRetry={retry}
                    appsTab={appsTab}
                />
            )}
        </Await>
    );
}
