import { Alert, Chip, FieldStack, Switch, Textarea } from "@pollinations/ui";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { BaseModelInput } from "./base-model-input.tsx";
import type { AgentFormState } from "./types.ts";

export function PromptAgentFields({
    form,
    disabled,
    onChange,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof AgentFormState,
        value: string | AgentFormState["mcpServers"],
    ) => void;
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

            <Alert intent="warning" title="Public instructions are not secret">
                Users may infer or extract these instructions. Do not include
                credentials, personal data, or confidential information.
            </Alert>

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

            <div className="space-y-3">
                {MCP_SERVERS.map((server) => {
                    const selected = form.mcpServers.includes(server.id);
                    return (
                        <div
                            key={server.id}
                            className="flex items-start justify-between gap-3"
                        >
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                        {server.name} MCP
                                    </span>
                                    <Chip size="sm" intent="neutral">
                                        Built-in
                                    </Chip>
                                </div>
                                <p className="text-xs text-theme-text-muted">
                                    {server.description}
                                </p>
                            </div>
                            <Switch
                                checked={selected}
                                disabled={disabled}
                                ariaLabel={`Allow ${server.name} tools`}
                                onChange={(value) =>
                                    onChange(
                                        "mcpServers",
                                        value
                                            ? [...form.mcpServers, server.id]
                                            : form.mcpServers.filter(
                                                  (id) => id !== server.id,
                                              ),
                                    )
                                }
                            />
                        </div>
                    );
                })}
                <p className="text-xs text-theme-text-muted">
                    Uses the caller's Pollinations API access. See the{" "}
                    <a
                        href="https://gen.pollinations.ai/docs#tag/mcp-servers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                    >
                        API docs
                    </a>
                    .
                </p>
            </div>
        </div>
    );
}
