import {
    Button,
    FieldStack,
    IconButton,
    Input,
    Textarea,
    XIcon,
} from "@pollinations/ui";
import type { AgentFormState, McpServerRow } from "./types.ts";

export function PromptAgentFields({
    form,
    disabled,
    onChange,
    onAddMcp,
    onUpdateMcp,
    onRemoveMcp,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof Omit<AgentFormState, "mcpServers">,
        value: string,
    ) => void;
    onAddMcp: () => void;
    onUpdateMcp: (
        index: number,
        key: keyof Omit<McpServerRow, "id">,
        value: string,
    ) => void;
    onRemoveMcp: (index: number) => void;
}) {
    return (
        <div className="space-y-4">
            <FieldStack
                label="System prompt"
                helper="The agent's instructions, sent as the system message on every call."
                alignLabelRow
            >
                <Textarea
                    name="prompt-agent-system-prompt"
                    value={form.systemPrompt}
                    placeholder="You are a helpful assistant that…"
                    rows={6}
                    maxLength={8000}
                    disabled={disabled}
                    onChange={(e) => onChange("systemPrompt", e.target.value)}
                />
            </FieldStack>

            <FieldStack
                label="Base model"
                helper="A Pollinations text model id the agent runs on, e.g. openai or claude."
                alignLabelRow
            >
                <Input
                    name="prompt-agent-base-model"
                    value={form.baseModel}
                    placeholder="openai"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={disabled}
                    onChange={(e) => onChange("baseModel", e.target.value)}
                />
            </FieldStack>

            <FieldStack
                label="MCP servers"
                helper="Public Streamable-HTTP MCP servers whose tools the agent can call."
                alignLabelRow
                action={
                    <Button
                        type="button"
                        size="sm"
                        intent="info"
                        className="shrink-0 text-sm"
                        disabled={disabled}
                        onClick={onAddMcp}
                    >
                        Add MCP server
                    </Button>
                }
            >
                {form.mcpServers.length > 0 && (
                    <div className="grid gap-2">
                        {form.mcpServers.map((row, index) => (
                            <div
                                key={row.id}
                                className="flex items-center gap-2"
                            >
                                <Input
                                    name={`prompt-agent-mcp-name-${index}`}
                                    value={row.name}
                                    placeholder="my-server"
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="w-40 shrink-0"
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onUpdateMcp(
                                            index,
                                            "name",
                                            e.target.value,
                                        )
                                    }
                                />
                                <Input
                                    name={`prompt-agent-mcp-url-${index}`}
                                    type="url"
                                    inputMode="url"
                                    value={row.url}
                                    placeholder="https://mcp.example.com"
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    className="flex-1"
                                    disabled={disabled}
                                    onChange={(e) =>
                                        onUpdateMcp(
                                            index,
                                            "url",
                                            e.target.value,
                                        )
                                    }
                                />
                                {!disabled && (
                                    <IconButton
                                        intent="danger"
                                        title="Remove MCP server"
                                        tooltip="Remove MCP server"
                                        onClick={() => onRemoveMcp(index)}
                                    >
                                        <XIcon className="h-4 w-4" />
                                    </IconButton>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </FieldStack>
        </div>
    );
}
