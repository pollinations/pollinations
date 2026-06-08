import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
    beforeLoad: () => {
        throw redirect({ href: "https://pollinations.ai/terms" });
    },
    component: RedirectComponent,
});

function RedirectComponent() {
    return null;
}
