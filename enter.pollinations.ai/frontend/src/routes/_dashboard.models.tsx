import { createFileRoute, redirect } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateModelSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    // Sandbox templates were a tab here; they now sit on the Sandboxes page.
    beforeLoad: ({ location }) => {
        const { category } = location.search as { category?: unknown };
        if (category === "sandbox") {
            throw redirect({ to: "/sandboxes", replace: true });
        }
    },
    component: Models,
});
