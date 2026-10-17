import { createFileRoute, redirect } from "@tanstack/react-router";
import { MyApps } from "../components/my-apps.tsx";

export const Route = createFileRoute("/_dashboard/my-apps")({
    beforeLoad: ({ context, location }) => {
        if (!context.user) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: MyApps,
});
