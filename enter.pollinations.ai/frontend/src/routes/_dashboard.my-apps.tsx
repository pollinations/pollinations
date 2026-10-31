import { Await, createFileRoute, redirect } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import type { ListedApp } from "../backend-types.ts";
import { MyApps } from "../components/my-apps.tsx";
import { Route as DashboardRoute, useDashboardRetry } from "./_dashboard.tsx";

export const Route = createFileRoute("/_dashboard/my-apps")({
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: MyAppsPage,
});

function MyAppsPage() {
    const retry = useDashboardRetry("apps");
    const { apps, user } = useDeferredValue(DashboardRoute.useLoaderData());
    const page = (listed?: ListedApp[] | null) => (
        <MyApps
            apps={listed}
            githubConnected={Boolean(user?.githubId)}
            onRetry={retry}
        />
    );
    return (
        <Await promise={apps} fallback={page()}>
            {page}
        </Await>
    );
}
