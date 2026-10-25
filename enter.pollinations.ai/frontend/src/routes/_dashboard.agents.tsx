import { createFileRoute } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateAgentsSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/agents")({
    validateSearch: validateAgentsSearch,
    component: AgentsPage,
});

// MCP servers or agents, one list at a time; the heading switches between them.
function AgentsPage() {
    const { view } = Route.useSearch();
    const kind = view === "agents" ? "agent" : "mcp";
    // Each list starts with its own fresh search.
    return <Models key={kind} kind={kind} />;
}
