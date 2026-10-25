import { createFileRoute, redirect } from "@tanstack/react-router";

// The Balance page's old address. Emails, Stripe returns, older CLI versions
// and apps link here, so it forwards for good, keeping search and #buy-pollen.
export const Route = createFileRoute("/_dashboard/pollen")({
    beforeLoad: ({ location }) => {
        throw redirect({
            to: "/balance",
            search: location.search,
            hash: location.hash,
            replace: true,
        });
    },
});
