import { Chip, FieldStack, Switch, Textarea } from "@pollinations/ui";
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

            <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                                Pollinations MCP
                            </span>
                            <Chip size="sm" intent="neutral">
                                Built-in
                            </Chip>
                        </div>
                        <p className="text-xs text-theme-text-muted">
                            Allow the agent to call Pollinations generation and
                            model-discovery tools.
                        </p>
                    </div>
                    <Switch
                        checked={form.mcpServers.includes("pollinations")}
                        disabled={disabled}
                        ariaLabel="Allow Pollinations tools"
                        onChange={(value) =>
                            onChange(
                                "mcpServers",
                                value ? ["pollinations"] : [],
                            )
                        }
                    />
                </div>
                <p className="break-all font-mono text-xs text-theme-text-muted">
                    https://mcp.pollinations.ai
                </p>
                <p className="text-xs text-theme-text-muted">
                    Uses the caller's Pollinations API access.{" "}
                    <a
                        href="https://gen.pollinations.ai/docs#tag/mcp-server"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                    >
                        API docs
                    </a>
                    {" · "}
                    <a
                        href="https://github.com/pollinations/pollinations/tree/main/packages/mcp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-current/40 underline-offset-2 hover:text-theme-text-soft"
                    >
                        GitHub
                    </a>
                </p>
            </div>
        </div>
    );
}
