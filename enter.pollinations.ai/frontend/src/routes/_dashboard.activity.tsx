import { createFileRoute, redirect } from "@tanstack/react-router";
import { Activity } from "../components/activity/activity.tsx";
import { validateActivitySearch } from "../components/activity/activity-search.ts";

export const Route = createFileRoute("/_dashboard/activity")({
    validateSearch: validateActivitySearch,
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: Activity,
});
