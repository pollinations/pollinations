import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { Sandboxes } from "../components/sandboxes.tsx";

export const Route = createFileRoute("/_dashboard/sandboxes")({
    component: SandboxesPage,
});

// Public: signed out, the page lists the templates and their prices, and
// Create asks you to sign in first.
function SandboxesPage() {
    const { user, sessionUnavailable } = useLoaderData({ from: "/_dashboard" });
    return <Sandboxes signedIn={Boolean(user) || sessionUnavailable} />;
}
