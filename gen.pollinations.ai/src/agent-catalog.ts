/**
 * Managed prompt agents, as the model catalog sees them.
 *
 * Agents are community models whose upstream is Enter's own agent runtime, so
 * everything the catalog needs to know about them lives here rather than in
 * the generic registry: where their runtime is, what their stored config
 * means, and how they present the metadata of the base model they wrap.
 */
import type { ModelCapability } from "@shared/registry/model-info.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/** The agent fields the catalog reads out of the stored agent config. */
export type AgentCatalogConfig = {
    baseModel: string;
    pollinationsTools: boolean;
};

/** Every environment binding the agent catalog needs. */
export type AgentCatalogEnv = Pick<
    CloudflareBindings,
    "AGENT_RUNTIME_BASE_URL"
>;

/** Where agent listings send their generation requests. */
export function agentRuntimeBaseUrl(env: AgentCatalogEnv): string {
    return env.AGENT_RUNTIME_BASE_URL;
}

/**
 * The catalog view of a stored agent config, or null when it cannot be read.
 *
 * A row whose config is unreadable still serves traffic through the runtime,
 * which parses it strictly; the catalog only loses the base-model metadata.
 */
export function parseAgentCatalogConfig(
    raw: string | null,
): AgentCatalogConfig | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.baseModel !== "string" || !parsed.baseModel.trim()) {
            return null;
        }
        return {
            baseModel: parsed.baseModel,
            pollinationsTools: parsed.pollinationsTools === true,
        };
    } catch {
        return null;
    }
}

function applyBaseModelMetadata(
    entry: GenerationModelEntry,
    baseEntry: GenerationModelEntry | undefined,
): void {
    const config = entry.agentConfig;
    if (!config) return;
    const agentCapabilities: ModelCapability[] = config.pollinationsTools
        ? ["pollinations_models"]
        : [];

    entry.info = {
        ...entry.info,
        base_model: config.baseModel,
        capabilities: [...entry.info.capabilities, ...agentCapabilities],
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
        output_modalities: base.output_modalities,
        capabilities: [...base.capabilities, ...agentCapabilities],
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
