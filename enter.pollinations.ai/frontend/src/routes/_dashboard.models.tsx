import { createFileRoute, redirect } from "@tanstack/react-router";
import { Models } from "../components/models";
import {
    validateAgentsSearch,
    validateModelSearch,
} from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    beforeLoad: ({ search, location }) => {
        // Agents and MCP servers were tabs of this page, searched with their
        // own agentQ / mcpQ params; keep shared links working.
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
