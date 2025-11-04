// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import {
    createSystemPromptTransform,
    removeSystemMessages,
} from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGoogleSearchTransform } from "./transforms/createGoogleSearchTransform.js";

// Import persona prompts
import unityPrompt from "./personas/unity.js";
import midijourneyPrompt from "./personas/midijourney.js";
import rtistPrompt from "./personas/rtist.js";
import evilPrompt from "./personas/evil.js";
import { bidaraSystemPrompt } from "./personas/bidara.js";
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

interface ModelDefinition {
    name: ValidServiceName;
    config: (typeof portkeyConfig)[ValidModelId]; // ✅ Type-safe: must be a valid model ID from TEXT_COSTS
    transform?: any;
    // aliases, tools, and persona (community) removed - now sourced from registry
    hidden?: boolean;
    supportsSystemMessages?: boolean;
}

const models: ModelDefinition[] = [
    {
        name: "openai",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-fast",
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
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
        name: "deepseek",
        config: portkeyConfig["myceli-deepseek-v3.1"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
    },
    {
        name: "roblox-rp",
        config: portkeyConfig["us.meta.llama3-1-8b-instruct-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "claudyclaude",
        config: portkeyConfig["us.anthropic.claude-haiku-4-5-20251001-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-reasoning",
        config: portkeyConfig["openai/o4-mini"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            removeSystemMessages,
        ),
        supportsSystemMessages: false,
    },
    {
        name: "o4-mini",
        config: portkeyConfig["openai/o4-mini"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            removeSystemMessages,
        ),
        supportsSystemMessages: false,
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

    // ======================================
    // Persona Models (use upstream endpoints)
    // ======================================

    {
        name: "unity",
        config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
        transform: createMessageTransform(unityPrompt),
    },
    {
        name: "midijourney",
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "rtist",
        config: portkeyConfig["gpt-4.1-2025-04-14"],
        transform: createMessageTransform(rtistPrompt),
    },
    {
        name: "evil",
        config: portkeyConfig["mistral-small-3.1-24b-instruct-2503"],
        transform: createMessageTransform(evilPrompt),
    },
    {
        name: "bidara",
        config: portkeyConfig["gpt-4.1-nano-2025-04-14"],
        transform: createMessageTransform(bidaraSystemPrompt),
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
export const availableModels = models.map((model) => ({
    ...model,
    aliases: getServiceAliases(model.name), // ✅ Sourced from registry
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
