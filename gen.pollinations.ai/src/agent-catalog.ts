/**
 * Managed prompt agents, as the model catalog sees them.
 *
 * Agents are community models whose upstream is Enter's own agent runtime, so
 * everything the catalog needs to know about them lives here rather than in
 * the generic registry: where their runtime is, what their stored config
 * means, and how they present the metadata of the base model they wrap.
 */

import type { McpServerId } from "@shared/registry/mcp.ts";
import type { ModelCapability } from "@shared/registry/model-info.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/** The agent fields the catalog reads out of the listing payload. */
export type AgentCatalogConfig = {
    baseModel: string;
    mcpServers: McpServerId[];
};

function applyBaseModelMetadata(
    entry: GenerationModelEntry,
    baseEntry: GenerationModelEntry | undefined,
): void {
    const config = entry.agentConfig;
    if (!config) return;
    const agentCapabilities: ModelCapability[] = [
        ...(config.mcpServers.includes("pollinations")
            ? (["pollinations_models"] as const)
            : []),
        ...(config.mcpServers.includes("exa") ? (["web_search"] as const) : []),
    ];

    entry.info = {
        ...entry.info,
        base_model: config.baseModel,
        capabilities: [
            ...new Set([...entry.info.capabilities, ...agentCapabilities]),
        ],
    };
    if (
        !baseEntry ||
        baseEntry.info.agent ||
        baseEntry.eventType !== "generate.text"
    ) {
        return;
    }

    const base = baseEntry.info;
    entry.info = {
        ...entry.info,
        pricing: base.pricing,
        pricing_variants: base.pricing_variants,
        pricing_default_label: base.pricing_default_label,
        pricing_adjustments: base.pricing_adjustments,
        input_modalities: base.input_modalities,
        // The agent runtime always returns an OpenAI chat text response. Media
        // produced by tools is represented as a link inside that response.
        output_modalities: ["text"],
        capabilities: [
            ...new Set([...base.capabilities, ...agentCapabilities]),
        ],
        tools: base.tools,
        reasoning: base.reasoning,
        context_length: base.context_length,
        paid_only: base.paid_only,
    };
}

/**
 * Present each agent listing with the capabilities and prices of the base
 * model it wraps, so callers see what they are actually charged for.
 */
export function applyAgentMetadata(
    entries: GenerationModelEntry[],
    byIdOrAlias: Map<string, GenerationModelEntry>,
): void {
    for (const entry of entries) {
        const baseModel = entry.agentConfig?.baseModel;
        if (baseModel) {
            applyBaseModelMetadata(entry, byIdOrAlias.get(baseModel));
        }
    }
}
