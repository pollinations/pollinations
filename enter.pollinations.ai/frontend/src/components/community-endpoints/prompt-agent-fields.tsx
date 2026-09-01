import { Alert, Chip, EditableCombobox, FieldStack, Switch, Textarea } from "@pollinations/ui";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { useEffect, useState } from "react";
import {
    fetchModelCatalog,
    getCatalogCategory,
    getCatalogModelId,
} from "../models/model-catalog.ts";
import { BaseModelInput } from "./base-model-input.tsx";
import type { AgentFormState } from "./types.ts";

/**
 * Multi-model selector for delegation targets.
 *
 * Includes regular models, community models, and agent models — all text
 * category. Unlike BaseModelInput, agent models are NOT excluded.
 *
 * The selector prevents duplicates: a model already in `selected` is not
 * shown as an option and cannot be picked again.
 *
 * Self-delegation is not blocked here; the repository has no existing
 * convention for blocking a specific agent from selecting itself, and the
 * issue requirements do not mandate it.
 */
function DelegateModelSelector({
    selected,
    disabled,
    onChange,
}: {
    selected: string[];
    disabled: boolean;
    onChange: (models: string[]) => void;
}) {
    const [allModels, setAllModels] = useState<string[]>([]);
    const [query, setQuery] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetchModelCatalog()
            .then((models) => {
                if (cancelled) return;
                setAllModels(
                    models
                        .filter(
                            (model) => getCatalogCategory(model) === "text",
                        )
                        .map(getCatalogModelId)
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b)),
                );
            })
            .catch(() => {
                if (!cancelled) setAllModels([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Only offer models that are not yet selected.
    const availableOptions = allModels.filter((m) => !selected.includes(m));

    function addModel(value: string) {
        const trimmed = value.trim();
        if (!trimmed || selected.includes(trimmed)) return;
        onChange([...selected, trimmed]);
        setQuery("");
    }

    function removeModel(modelId: string) {
        onChange(selected.filter((m) => m !== modelId));
    }

    return (
        <div className="space-y-2">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((modelId) => (
                        <span
                            key={modelId}
                            className="inline-flex items-center gap-1 rounded-lg bg-theme-bg-active px-2 py-1 text-xs font-mono text-theme-text-strong"
                        >
                            {modelId}
                            <button
                                type="button"
                                aria-label={`Remove ${modelId}`}
                                disabled={disabled}
                                onClick={() => removeModel(modelId)}
                                className="ml-0.5 text-theme-text-muted hover:text-theme-text-strong disabled:cursor-not-allowed"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <EditableCombobox
                name="prompt-agent-delegate-model"
                value={query}
                options={availableOptions}
                placeholder="Add a model or agent ID…"
                align="start"
                emptyMessage="No models match. You can still type any model ID."
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={disabled}
                onChange={setQuery}
                onOpenChange={(open) => {
                    // When the dropdown closes after an item is selected,
                    // the combobox writes the selected value into `query`.
                    // We want to commit it as an addition instead.
                    if (!open && query.trim()) addModel(query);
                }}
            />
            {query.trim() &&
                !selected.includes(query.trim()) &&
                !availableOptions.includes(query.trim()) && (
                    <p className="text-xs text-theme-text-muted">
                        Press Enter or close the dropdown to add{" "}
                        <span className="font-mono">{query.trim()}</span> as a
                        custom model ID.
                    </p>
                )}
        </div>
    );
}

export function PromptAgentFields({
    form,
    disabled,
    onChange,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof AgentFormState,
        value: string | AgentFormState["mcpServers"] | AgentFormState["delegateModels"],
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

            <FieldStack
                label="Delegate models"
                helper="Optional. When set, the agent gains a built-in delegate tool restricted to exactly these model or agent IDs. Leave empty to disable delegation entirely."
                alignLabelRow
            >
                <DelegateModelSelector
                    selected={form.delegateModels}
                    disabled={disabled}
                    onChange={(models) => onChange("delegateModels", models)}
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
