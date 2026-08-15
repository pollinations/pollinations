import {
    BotIcon,
    Button,
    Chip,
    IconButton,
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate text-base font-semibold text-theme-text-strong">
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
                <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                    <Button
                        type="button"
                        size="sm"
                        intent="info"
                        className="gap-1.5"
                        onClick={onEdit}
                    >
                        <BotIcon className="h-3.5 w-3.5" />
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
                <span className="flex min-w-0 items-start gap-1.5">
                    <TerminalIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">
                        Base model:{" "}
                        <span className="break-all font-mono">
                            {agent.baseModel}
                        </span>
                    </span>
                </span>
                <span className="flex min-w-0 items-start gap-1.5">
                    <TokensIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 break-words">
                        {agent.pollinationsTools
                            ? "Pollinations tools enabled"
                            : "Pollinations tools disabled"}
                        {agent.mcpServers.length > 0 &&
                            ` · ${agent.mcpServers.length} custom MCP server${agent.mcpServers.length === 1 ? "" : "s"}`}
                    </span>
                </span>
            </div>
        </Surface>
    );
}
