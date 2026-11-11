import { createFileRoute, redirect } from "@tanstack/react-router";
import { Models } from "../components/models";
import {
    validateAgentsSearch,
    validateModelSearch,
} from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    beforeLoad: ({ search, location }) => {
        // Agents, MCP servers and sandbox templates were tabs of this page;
        // keep shared links working. Sandbox templates now sit on the
        // Sandboxes page.
        if (search.category === "sandbox") {
            throw redirect({ to: "/sandboxes", replace: true });
        }
        if (search.category !== "agent" && search.category !== "mcp") return;
        const mcp = search.category === "mcp";
        const old: Record<string, unknown> = location.search;
        throw redirect({
            to: "/agents",
            search: validateAgentsSearch({
                view: mcp ? "mcp" : undefined,
                q: mcp ? old.mcpQ : old.agentQ,
                sort: search.sort,
            }),
            replace: true,
        });
    },
    component: () => <Models kind="models" />,
});
