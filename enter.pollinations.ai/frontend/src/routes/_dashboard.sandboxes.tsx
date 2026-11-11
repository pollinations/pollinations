import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback } from "react";
import { Sandboxes } from "../components/sandboxes.tsx";

export const Route = createFileRoute("/_dashboard/sandboxes")({
    // `create`: the Models page's Sandboxes tab names a template to start.
    validateSearch: (search: Record<string, unknown>): { create?: string } =>
        typeof search.create === "string" ? { create: search.create } : {},
    beforeLoad: ({ context, location }) => {
        if (!context.user && !context.sessionUnavailable) {
            throw redirect({
                to: "/sign-in",
                search: { next: location.href },
            });
        }
    },
    component: SandboxesPage,
});

function SandboxesPage() {
    const { create } = Route.useSearch();
    const navigate = Route.useNavigate();
    const clearCreate = useCallback(
        () => void navigate({ search: {}, replace: true }),
        [navigate],
    );
    return <Sandboxes create={create} onCreateOpened={clearCreate} />;
}
