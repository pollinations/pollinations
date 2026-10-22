import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { MyApps } from "../components/my-apps.tsx";
import { useDashboardApps, useDashboardRetry } from "./_dashboard.tsx";

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
    const apps = useDashboardApps();
    const retry = useDashboardRetry("apps");
    // Keep MyApps' empty state available for a later launch to all users.
    if (apps?.length === 0) return <Navigate to="/news" replace />;
    return <MyApps apps={apps} onRetry={retry} />;
}
