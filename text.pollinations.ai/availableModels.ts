// Import transform functions
import {
    createSystemPromptTransform,
} from "./transforms/createSystemPromptTransform.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig, type ValidModelId } from "./configs/modelConfigs.js";

// Import registry for validation and aliases
import type { TEXT_SERVICES } from "../shared/registry/text.js";
import {
    resolveServiceId,
    getServiceAliases,
} from "../shared/registry/registry.js";

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof TEXT_SERVICES;

interface ModelDefinition {
    name: ValidServiceName;
    description: string;
    config: (typeof portkeyConfig)[ValidModelId];
    transform?: any;
    tier: "anonymous" | "seed" | "flower" | "nectar";
    community?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    tools?: boolean;
    maxInputChars?: number;
    reasoning?: boolean;
    uncensored?: boolean;
    hidden?: boolean;
    voices?: string[];
    supportsSystemMessages?: boolean;
}

const models: ModelDefinition[] = [
    {
        name: "openai-fast",
        description: "GPT-OSS 20B Reasoning LLM (OVH)",
        config: portkeyConfig["gpt-oss-20b"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
        reasoning: true,
        tier: "anonymous",
        community: false,
        input_modalities: ["text"],
        output_modalities: ["text"],
        tools: true,
    },
];

// Export models with aliases from registry and computed properties
export const availableModels = models.map((model) => {
    const inputs = model.input_modalities || [];
    const outputs = model.output_modalities || [];

    // Get aliases from registry (single source of truth)
    const aliases = getServiceAliases(model.name);

    return {
        ...model,
        aliases,
        vision: inputs.includes("image"),
        audio: inputs.includes("audio") || outputs.includes("audio"),
    };
});

/**
 * Find a model definition by name or alias
 * Uses registry to resolve aliases to service names
 * @param modelName - The name or alias of the model to find
 * @returns The model definition or null if not found
 */
export function findModelByName(modelName: string) {
    // First try direct lookup
    const directMatch = availableModels.find(
        (model) => model.name === modelName,
    );
    if (directMatch) return directMatch;

    // Try resolving via registry (handles aliases)
    try {
        const resolvedServiceId = resolveServiceId(modelName, "generate.text");
        return (
            availableModels.find((model) => model.name === resolvedServiceId) ||
            null
        );
    } catch {
        return null;
    }
}
