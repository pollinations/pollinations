import { createFileRoute, redirect } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateModelSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    beforeLoad: ({ search }) => {
        // Agents and MCP servers were tabs of this page; keep shared links working.
        if (search.category === "agent") throw redirect({ to: "/agents" });
        if (search.category === "mcp") {
            throw redirect({ to: "/agents", search: { view: "mcp" } });
        }
    },
    component: () => <Models kind="models" />,
});
