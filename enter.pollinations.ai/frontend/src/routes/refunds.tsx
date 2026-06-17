import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/refunds")({
    beforeLoad: () => {
        throw redirect({ href: "https://pollinations.ai/refunds" });
    },
    component: RedirectComponent,
});

function RedirectComponent() {
    return null;
}
