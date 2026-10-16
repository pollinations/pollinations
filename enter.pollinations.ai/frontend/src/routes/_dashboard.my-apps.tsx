import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import {
    LoadError,
    PageLoading,
} from "../components/layout/dashboard-loading.tsx";
import { MyApps } from "../components/my-apps.tsx";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-apps")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: MyAppsPage,
});

function MyAppsPage() {
    const retry = useDashboardRetry("profile");
    const { profile } = useDeferredValue(DashboardRoute.useLoaderData());
    return (
        <Await promise={profile} fallback={<PageLoading titles={["Apps"]} />}>
            {(details) =>
                details ? (
                    <MyApps githubId={details.githubId} />
                ) : (
                    <LoadError onRetry={retry}>
                        Couldn’t load your profile.
                    </LoadError>
                )
            }
        </Await>
    );
}
