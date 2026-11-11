import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Sandboxes } from "../components/sandboxes.tsx";

export const Route = createFileRoute("/_dashboard/sandboxes")({
    component: SandboxesPage,
});

// Public: signed out, the page is the templates' price list.
function SandboxesPage() {
    const { user, sessionUnavailable } = useLoaderData({ from: "/_dashboard" });
    return <Sandboxes signedIn={Boolean(user) || sessionUnavailable} />;
}
