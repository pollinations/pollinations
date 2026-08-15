import {
    Button,
    Chip,
    IconButton,
    SproutIcon,
    Surface,
    TerminalIcon,
    TokensIcon,
    XIcon,
} from "@pollinations/ui";
import type { ManagedAgent } from "./types.ts";

export function AgentCard({
    agent,
    onEdit,
    onDelete,
}: {
    agent: ManagedAgent;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <Surface>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-theme-text-strong">
                            Agent draft
                        </h3>
                        <Chip intent="neutral" size="sm">
                            Needs listing details
                        </Chip>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-theme-text-muted">
                        {agent.systemPrompt}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <Button
                        type="button"
                        size="sm"
                        intent="info"
                        className="gap-1.5"
                        onClick={onEdit}
                    >
                        <SproutIcon className="h-3.5 w-3.5" />
                        Complete setup
                    </Button>
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
                <span className="inline-flex items-center gap-1.5">
                    <TokensIcon className="h-3.5 w-3.5" />
                    {agent.pollinationsTools
                        ? "Pollinations tools enabled"
                        : "Pollinations tools disabled"}
                    {agent.mcpServers.length > 0 &&
                        ` · ${agent.mcpServers.length} custom MCP server${agent.mcpServers.length === 1 ? "" : "s"}`}
                </span>
            </div>
        </Surface>
    );
}
