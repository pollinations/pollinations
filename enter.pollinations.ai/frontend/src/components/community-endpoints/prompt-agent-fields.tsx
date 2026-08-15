import {
    Button,
    Chip,
    FieldStack,
    IconButton,
    Input,
    Switch,
    Textarea,
    XIcon,
} from "@pollinations/ui";
import { BaseModelInput } from "./base-model-input.tsx";
import type { AgentFormState } from "./types.ts";

export function PromptAgentFields({
    form,
    disabled,
    onChange,
    onAddMcp,
    onUpdateMcp,
    onRemoveMcp,
    onAddMcpHeader,
    onUpdateMcpHeader,
    onRemoveMcpHeader,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof Omit<AgentFormState, "mcpServers">,
        value: string | boolean,
    ) => void;
    onAddMcp: () => void;
    onUpdateMcp: (index: number, key: "name" | "url", value: string) => void;
    onRemoveMcp: (index: number) => void;
    onAddMcpHeader: (serverIndex: number) => void;
    onUpdateMcpHeader: (
        serverIndex: number,
        headerIndex: number,
        key: "name" | "value",
        value: string,
    ) => void;
    onRemoveMcpHeader: (serverIndex: number, headerIndex: number) => void;
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
                helper="Pick a Pollinations text model or type any model ID. Accepted inputs are inherited from this model."
                alignLabelRow
            >
                <BaseModelInput
                    value={form.baseModel}
                    disabled={disabled}
                    onChange={(value) => onChange("baseModel", value)}
                />
            </FieldStack>

            <FieldStack
                label="MCP servers"
                helper="Streamable-HTTP MCP servers whose tools the agent can call. Optional request headers are stored encrypted."
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
                <div className="rounded-md border border-divider p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                    Pollinations MCP
                                </span>
                                <Chip size="sm" intent="neutral">
                                    Built-in
                                </Chip>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-text-muted">
                                <span className="break-all font-mono">
                                    https://mcp.pollinations.ai
                                </span>
                                <a
                                    href="https://gen.pollinations.ai/docs#tag/mcp-server"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                                >
                                    Documentation
                                </a>
                            </div>
                            <p className="text-xs text-theme-text-muted">
                                Uses the caller's Pollinations API access.
                            </p>
                        </div>
                        <Switch
                            checked={form.pollinationsTools}
                            disabled={disabled}
                            ariaLabel="Allow Pollinations tools"
                            onChange={(value) =>
                                onChange("pollinationsTools", value)
                            }
                        />
                    </div>
                </div>
                {form.mcpServers.length > 0 && (
                    <div className="mt-2 grid gap-2">
                        {form.mcpServers.map((row, index) => (
                            <div
                                key={row.id}
                                className="space-y-2 rounded-md border border-divider p-2"
                            >
                                <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                                    <Input
                                        name={`prompt-agent-mcp-name-${index}`}
                                        aria-label={`MCP server ${index + 1} name`}
                                        value={row.name}
                                        placeholder="my-server"
                                        autoComplete="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        className="min-w-0"
                                        disabled={disabled}
                                        onChange={(e) =>
                                            onUpdateMcp(
                                                index,
                                                "name",
                                                e.target.value,
                                            )
                                        }
                                    />
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Input
                                            name={`prompt-agent-mcp-url-${index}`}
                                            aria-label={`MCP server ${index + 1} URL`}
                                            type="url"
                                            inputMode="url"
                                            value={row.url}
                                            placeholder="https://mcp.example.com"
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            className="min-w-0 flex-1"
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
                                                onClick={() =>
                                                    onRemoveMcp(index)
                                                }
                                            >
                                                <XIcon className="h-4 w-4" />
                                            </IconButton>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-theme-text-muted">
                                        Request headers
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={
                                            disabled || row.headers.length >= 16
                                        }
                                        onClick={() => onAddMcpHeader(index)}
                                    >
                                        Add header
                                    </Button>
                                </div>
                                {row.headers.map((header, headerIndex) => (
                                    <div
                                        key={header.id}
                                        className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center"
                                    >
                                        <Input
                                            name={`prompt-agent-mcp-header-name-${index}-${headerIndex}`}
                                            aria-label={`MCP server ${index + 1} header ${headerIndex + 1} name`}
                                            value={header.name}
                                            placeholder="Authorization"
                                            autoComplete="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            className="min-w-0"
                                            disabled={disabled}
                                            onChange={(event) =>
                                                onUpdateMcpHeader(
                                                    index,
                                                    headerIndex,
                                                    "name",
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Input
                                                name={`prompt-agent-mcp-header-value-${index}-${headerIndex}`}
                                                aria-label={`MCP server ${index + 1} header ${headerIndex + 1} value`}
                                                type="password"
                                                value={header.value}
                                                placeholder={
                                                    header.saved
                                                        ? "Saved — leave blank to keep"
                                                        : "Header value"
                                                }
                                                autoComplete="new-password"
                                                autoCapitalize="none"
                                                data-lpignore="true"
                                                data-1p-ignore="true"
                                                data-bwignore="true"
                                                className="min-w-0 flex-1"
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    onUpdateMcpHeader(
                                                        index,
                                                        headerIndex,
                                                        "value",
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                            {!disabled && (
                                                <IconButton
                                                    intent="danger"
                                                    title="Remove header"
                                                    tooltip="Remove header"
                                                    onClick={() =>
                                                        onRemoveMcpHeader(
                                                            index,
                                                            headerIndex,
                                                        )
                                                    }
                                                >
                                                    <XIcon className="h-4 w-4" />
                                                </IconButton>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </FieldStack>
        </div>
    );
}
