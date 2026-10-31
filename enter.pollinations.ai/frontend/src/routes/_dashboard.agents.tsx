import { createFileRoute } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateAgentsSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/agents")({
    validateSearch: validateAgentsSearch,
    component: AgentsPage,
});

// Agents or MCP servers, one list at a time; the drawer has a row for each.
function AgentsPage() {
    const { view } = Route.useSearch();
    const kind = view === "mcp" ? "mcp" : "agent";
    // Each list starts with its own fresh search.
    return <Models key={kind} kind={kind} />;
}
