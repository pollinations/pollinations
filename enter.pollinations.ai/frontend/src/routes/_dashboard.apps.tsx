import { createFileRoute, redirect } from "@tanstack/react-router";
import { KeyManagement } from "./_dashboard.keys.tsx";
export const Route = createFileRoute("/_dashboard/apps")({
    beforeLoad: ({ context, location }) => {
        if (!context.user)
            throw redirect({ to: "/sign-in", search: { next: location.href } });
    },
    component: () => <KeyManagement kind="apps" />,
});
