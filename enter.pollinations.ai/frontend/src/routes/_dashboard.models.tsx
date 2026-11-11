import { createFileRoute, redirect } from "@tanstack/react-router";
import { Models } from "../components/models";
import {
    validateAgentsSearch,
    validateModelSearch,
} from "../components/models/model-search.ts";

const OLD_TABS: Record<string, "agent" | "mcp" | "sandbox"> = {
    agent: "agent",
    mcp: "mcp",
    sandbox: "sandbox",
};

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    beforeLoad: ({ search, location }) => {
        // Agents, MCP servers and sandbox templates were tabs of this page,
        // searched with their own agentQ / mcpQ / sandboxQ params; keep
        // shared links working.
        const view = OLD_TABS[search.category ?? ""];
        if (!view) return;
        const old: Record<string, unknown> = location.search;
        throw redirect({
            to: "/agents",
            search: validateAgentsSearch({
                view: view === "agent" ? undefined : view,
                q: old[`${view}Q`],
                sort: search.sort,
            }),
            replace: true,
        });
    },
    component: () => <Models kind="models" />,
});
