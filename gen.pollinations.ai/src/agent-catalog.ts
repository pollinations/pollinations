/**
 * Hosted agents, as the model catalog sees them.
 *
 * Agents are community models whose runtime-specific metadata is not covered
 * by the generic model registry: what their stored config means and which
 * modalities or tools their runtime exposes.
 */

import type { McpServerId } from "@shared/registry/mcp.ts";
import type { ModelCapability } from "@shared/registry/model-info.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/** The agent fields the catalog reads out of the listing payload. */
export type AgentCatalogConfig = {
    baseModel: string;
    mcpServers: McpServerId[];
};

function applyEndpointAgentMetadata(entry: GenerationModelEntry): void {
    const endpoint = entry.communityEndpoint;
    if (endpoint?.type !== "endpoint_agent") return;

    // Floret's brain accepts text and its built-in Pollinations tool loop can
    // return generated media alongside the final chat response.
    if (entry.id === "pollinations-router/floret") {
        entry.info = {
            ...entry.info,
            input_modalities: ["text"],
            output_modalities: ["text", "image", "video", "audio"],
            capabilities: [
                ...new Set([
                    ...entry.info.capabilities,
                    "web_search" as const,
                    "code_execution" as const,
                    "pollinations_models" as const,
                ]),
            ],
        };
    }
}

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
 * Present each agent listing with the modalities and capabilities of its
 * runtime, plus the prices of the base model used by managed prompt agents.
 */
export function applyAgentMetadata(
    entries: GenerationModelEntry[],
    byIdOrAlias: Map<string, GenerationModelEntry>,
): void {
    for (const entry of entries) {
        applyEndpointAgentMetadata(entry);
        const baseModel = entry.agentConfig?.baseModel;
        if (baseModel) {
            applyBaseModelMetadata(entry, byIdOrAlias.get(baseModel));
        }
    }
}
