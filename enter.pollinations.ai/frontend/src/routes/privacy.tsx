import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
    beforeLoad: () => {
        throw redirect({ href: "https://pollinations.ai/privacy" });
    },
    component: RedirectComponent,
});

function RedirectComponent() {
    return null;
}
