import { createFileRoute, redirect } from "@tanstack/react-router";

// My Apps is the Apps tab of Listings now; its old address opens that tab.
export const Route = createFileRoute("/_dashboard/my-apps")({
    beforeLoad: () => {
        throw redirect({
            to: "/my-models",
            search: { tab: "apps" },
            replace: true,
        });
    },
});
