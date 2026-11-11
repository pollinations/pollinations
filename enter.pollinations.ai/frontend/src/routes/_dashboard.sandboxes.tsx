import {
    createFileRoute,
    useLoaderData,
    useNavigate,
} from "@tanstack/react-router";
import { SandboxTemplates } from "../components/sandbox-templates.tsx";
import { Sandboxes } from "../components/sandboxes.tsx";

export const Route = createFileRoute("/_dashboard/sandboxes")({
    component: SandboxesPage,
});

// Public: signed out, the page shows only the templates and their prices, and
// Create asks you to sign in first.
function SandboxesPage() {
    const { user, sessionUnavailable } = useLoaderData({ from: "/_dashboard" });
    const navigate = useNavigate();
    if (user || sessionUnavailable) return <Sandboxes />;
    return (
        <SandboxTemplates
            onCreate={() =>
                void navigate({
                    to: "/sign-in",
                    search: { next: "/sandboxes" },
                })
            }
        />
    );
}
