// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import {
    createSystemPromptTransform,
    removeSystemMessages,
} from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGoogleSearchTransform } from "./transforms/createGoogleSearchTransform.js";

// Import persona prompts
import midijourneyPrompt from "./personas/midijourney.js";
import chickyTutorPrompt from "./personas/chickytutor.js";

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

// Simplified: only runtime dependencies (config & transform)
// All metadata (description, modalities, etc.) is now in the registry
interface ModelDefinition {
    name: ValidServiceName;
    config: (typeof portkeyConfig)[ValidModelId]; // Portkey routing configuration
    transform?: any; // Message transformation function
}

// Simplified model definitions - only runtime dependencies (config & transform)
// All metadata is now in the registry (shared/registry/text.ts)
const models: ModelDefinition[] = [
    {
        name: "openai",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-fast",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-large",
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "qwen-coder",
        config: portkeyConfig["qwen2.5-coder-32b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "mistral",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "mistral-fast",
        config: portkeyConfig["us.meta.llama3-1-8b-instruct-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "deepseek",
        config: portkeyConfig["myceli-deepseek-v3.1"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "grok",
        config: portkeyConfig["myceli-grok-4-fast"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
    },
    {
        name: "claude",
        config: portkeyConfig["us.anthropic.claude-haiku-4-5-20251001-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "claude-large",
        config: portkeyConfig["us.anthropic.claude-sonnet-4-5-20250929-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-reasoning",
        config: portkeyConfig["openai/o4-mini"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            removeSystemMessages,
        ),
    },
    {
        name: "gemini",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "gemini-search",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(createGoogleSearchTransform()),
    },
    {
        name: "midijourney",
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "chickytutor",
        config: portkeyConfig["us.anthropic.claude-3-5-haiku-20241022-v1:0"],
        transform: createMessageTransform(chickyTutorPrompt),
    },
    {
        name: "perplexity-fast",
        config: portkeyConfig["sonar"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "perplexity-reasoning",
        config: portkeyConfig["sonar-reasoning"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
];

// Export models with aliases from registry
// All metadata (description, modalities, etc.) is in the registry - use getTextModelsInfo() for full info
export const availableModels = models.map((model) => ({
    ...model,
    aliases: getServiceAliases(model.name), // Sourced from registry
}));

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
