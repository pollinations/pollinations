// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import {
    createSystemPromptTransform,
    removeSystemMessages,
} from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGoogleSearchTransform } from "./transforms/createGoogleSearchTransform.js";
import { createGeminiToolsTransform } from "./transforms/createGeminiToolsTransform.ts";

// Import persona prompts
import midijourneyPrompt from "./personas/midijourney.js";
import chickyTutorPrompt from "./personas/chickytutor.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig } from "./configs/modelConfigs.js";

// Import registry for validation
import type { TEXT_SERVICES } from "../shared/registry/text.js";
import { resolveServiceId, type ModelId } from "../shared/registry/registry.js";

// Type constraint: model names must exist in registry
type ValidServiceName = keyof typeof TEXT_SERVICES;

interface ModelDefinition {
    name: ValidServiceName;
    config: (typeof portkeyConfig)[ModelId];
    transform?: any;
}

const models: ModelDefinition[] = [
    {
        name: "openai",
        config: portkeyConfig["gpt-5-mini-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-fast",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-large",
        config: portkeyConfig["gpt-5.2"],
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
        name: "grok",
        config: portkeyConfig["myceli-grok-4-fast"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
    },
    {
        name: "claude-fast",
        config: portkeyConfig["us.anthropic.claude-haiku-4-5-20251001-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "claude",
        config: portkeyConfig["us.anthropic.claude-sonnet-4-5-20250929-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "claude-large",
        config: portkeyConfig["global.anthropic.claude-opus-4-5-20251101-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "gemini",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            createGeminiToolsTransform(),
        ),
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
    {
        name: "kimi-k2-thinking",
        config: portkeyConfig["kimi-k2-thinking-maas"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "gemini-large",
        config: portkeyConfig["gemini-3-pro-preview"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            createGeminiToolsTransform(["google_search", "url_context"]),
        ),
    },
    {
        name: "nova-micro",
        config: portkeyConfig["amazon.nova-micro-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
];

// Export models - metadata is in registry (single source of truth)
export const availableModels = models;

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
