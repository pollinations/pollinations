import {
    Chip,
    ExternalLinkIcon,
    IconButton,
    PencilIcon,
    Surface,
    TerminalIcon,
    TokensIcon,
    XIcon,
} from "@pollinations/ui";
import type { ManagedAgent } from "./types.ts";

export function AgentCard({
    agent,
    registeredModelId,
    onEdit,
    onDelete,
}: {
    agent: ManagedAgent;
    registeredModelId?: string;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <Surface>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-theme-text-strong">
                            {agent.name}
                        </h3>
                        <Chip
                            intent={registeredModelId ? "news" : "neutral"}
                            size="sm"
                        >
                            {registeredModelId ? "Registered" : "Unlisted"}
                        </Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-theme-text-muted">
                        {agent.systemPrompt}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                        intent="info"
                        title="Edit agent"
                        tooltip="Edit agent"
                        onClick={onEdit}
                    >
                        <PencilIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                        intent="danger"
                        title="Delete agent"
                        tooltip="Delete agent"
                        onClick={onDelete}
                    >
                        <XIcon className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-theme-text-muted sm:grid-cols-2">
                <span className="inline-flex items-center gap-1.5">
                    <TerminalIcon className="h-3.5 w-3.5" />
                    Base model: {agent.baseModel}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                    <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{agent.baseUrl}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <TokensIcon className="h-3.5 w-3.5" />
                    {agent.mcpServers.length} MCP server
                    {agent.mcpServers.length === 1 ? "" : "s"}
                </span>
                {registeredModelId && (
                    <span className="truncate font-mono">
                        {registeredModelId}
                    </span>
                )}
            </div>
        </Surface>
    );
}
