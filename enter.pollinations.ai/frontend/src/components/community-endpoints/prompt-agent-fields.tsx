import {
    Alert,
    Chip,
    FieldStack,
    Input,
    Switch,
    Textarea,
} from "@pollinations/ui";
import type { OptiLLMConfig } from "@shared/community-endpoints.ts";
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
    onChange: <K extends keyof AgentFormState>(
        key: K,
        value: AgentFormState[K],
    ) => void;
}) {
    function selectOptillm(approach: string) {
        let config: OptiLLMConfig | undefined;
        if (approach === "re2" || approach === "cot_reflection") {
            config = { approach };
        } else if (approach === "bon") {
            config = { approach, bestOfN: 3 };
        } else if (approach === "mcts") {
            config = {
                approach,
                simulations: 2,
                depth: 1,
                exploration: 0.2,
            };
        } else if (approach === "rstar") {
            config = {
                approach,
                maxDepth: 3,
                rollouts: 5,
                exploration: 1.4,
            };
        }
        onChange("optillm", config);
        if (config) onChange("mcpServers", []);
    }

    function updateOptillm(values: Partial<OptiLLMConfig>) {
        if (form.optillm) {
            onChange("optillm", {
                ...form.optillm,
                ...values,
            } as OptiLLMConfig);
        }
    }

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
                label="Reasoning approach"
                helper="Optionally run this agent through OptiLLM. Approaches use extra base-model calls and cannot currently use MCP tools."
                alignLabelRow
            >
                <select
                    name="prompt-agent-optillm-approach"
                    value={form.optillm?.approach ?? ""}
                    disabled={disabled}
                    className="w-full rounded-lg border border-divider bg-theme-background px-3 py-2 text-theme-text-strong disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(event) => selectOptillm(event.target.value)}
                >
                    <option value="">Disabled</option>
                    <option value="re2">Re-reading (Re2)</option>
                    <option value="cot_reflection">
                        Chain-of-thought reflection
                    </option>
                    <option value="bon">Best of N</option>
                    <option value="mcts">Monte Carlo tree search</option>
                    <option value="rstar">rStar</option>
                </select>
            </FieldStack>

            {form.optillm?.approach === "bon" && (
                <OptillmNumberField
                    label="Candidates"
                    value={form.optillm.bestOfN}
                    min={2}
                    max={5}
                    step={1}
                    disabled={disabled}
                    onChange={(bestOfN) => updateOptillm({ bestOfN })}
                />
            )}
            {form.optillm?.approach === "mcts" && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <OptillmNumberField
                        label="Simulations"
                        value={form.optillm.simulations}
                        min={1}
                        max={4}
                        step={1}
                        disabled={disabled}
                        onChange={(simulations) =>
                            updateOptillm({ simulations })
                        }
                    />
                    <OptillmNumberField
                        label="Depth"
                        value={form.optillm.depth}
                        min={1}
                        max={3}
                        step={1}
                        disabled={disabled}
                        onChange={(depth) => updateOptillm({ depth })}
                    />
                    <OptillmNumberField
                        label="Exploration"
                        value={form.optillm.exploration}
                        min={0}
                        max={1}
                        step={0.1}
                        disabled={disabled}
                        onChange={(exploration) =>
                            updateOptillm({ exploration })
                        }
                    />
                </div>
            )}
            {form.optillm?.approach === "rstar" && (
                <div className="grid gap-3 sm:grid-cols-3">
                    <OptillmNumberField
                        label="Max depth"
                        value={form.optillm.maxDepth}
                        min={1}
                        max={4}
                        step={1}
                        disabled={disabled}
                        onChange={(maxDepth) => updateOptillm({ maxDepth })}
                    />
                    <OptillmNumberField
                        label="Rollouts"
                        value={form.optillm.rollouts}
                        min={1}
                        max={8}
                        step={1}
                        disabled={disabled}
                        onChange={(rollouts) => updateOptillm({ rollouts })}
                    />
                    <OptillmNumberField
                        label="Exploration"
                        value={form.optillm.exploration}
                        min={0.1}
                        max={5}
                        step={0.1}
                        disabled={disabled}
                        onChange={(exploration) =>
                            updateOptillm({ exploration })
                        }
                    />
                </div>
            )}

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
                                disabled={disabled || Boolean(form.optillm)}
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

function OptillmNumberField({
    label,
    value,
    min,
    max,
    step,
    disabled,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled: boolean;
    onChange: (value: number) => void;
}) {
    return (
        <FieldStack label={label}>
            <Input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </FieldStack>
    );
}
