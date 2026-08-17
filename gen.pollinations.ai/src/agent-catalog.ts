/**
 * Prompt agents, as the model catalog sees them.
 *
 * Both built-in and managed community agents inherit the capabilities of the
 * base model they wrap. Managed agents also inherit its price because their
 * nested base-model call is what bills the user; built-in agents retain their
 * own registry price because Gen bills their request directly.
 */
import type { ModelCapability } from "@shared/registry/model-info.ts";
import type { GenerationModelEntry } from "./model-registry.ts";

/** The agent fields the catalog reads out of the stored agent config. */
export type AgentCatalogConfig = {
    baseModel: string;
    mcpServers: "pollinations"[];
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
            mcpServers: Array.isArray(parsed.mcpServers)
                ? parsed.mcpServers.filter(
                      (server): server is "pollinations" =>
                          server === "pollinations",
                  )
                : [],
        };
    } catch {
        return null;
    }
}

function applyBaseModelMetadata(
    entry: GenerationModelEntry,
    baseEntry: GenerationModelEntry | undefined,
    baseModel: string,
    agentCapabilities: ModelCapability[],
    inheritPricing: boolean,
): void {
    entry.info = {
        ...entry.info,
        base_model: baseModel,
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
        ...(inheritPricing && {
            pricing: base.pricing,
            pricing_variants: base.pricing_variants,
            pricing_default_label: base.pricing_default_label,
            pricing_adjustments: base.pricing_adjustments,
            paid_only: base.paid_only,
        }),
        input_modalities: base.input_modalities,
        output_modalities: base.output_modalities,
        capabilities: [...base.capabilities, ...agentCapabilities],
        tools: base.tools,
        reasoning: base.reasoning,
        context_length: base.context_length,
        max_reference_images: base.max_reference_images,
        max_reference_videos: base.max_reference_videos,
    };
}

/**
 * Present each agent with the capabilities of its base model. Managed agents
 * also inherit the base price because that nested call performs their billing.
 */
export function applyAgentMetadata(
    entries: GenerationModelEntry[],
    byIdOrAlias: Map<string, GenerationModelEntry>,
): void {
    for (const entry of entries) {
        const config = entry.agentConfig;
        const baseModel =
            config?.baseModel ??
            (entry.info.agent ? entry.info.base_model : undefined);
        if (baseModel) {
            const agentCapabilities: ModelCapability[] =
                config?.mcpServers.includes("pollinations")
                    ? ["pollinations_models"]
                    : [];
            applyBaseModelMetadata(
                entry,
                byIdOrAlias.get(baseModel),
                baseModel,
                agentCapabilities,
                config !== undefined,
            );
        }
    }
}
