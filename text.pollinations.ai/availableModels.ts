// Import transform functions
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import {
    createSystemPromptTransform,
    removeSystemMessages,
} from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { createGeminiToolsTransform } from "./transforms/createGeminiToolsTransform.ts";
import { createGeminiThinkingTransform } from "./transforms/createGeminiThinkingTransform.ts";
import { sanitizeToolSchemas } from "./transforms/sanitizeToolSchemas.js";
import { removeToolsForJsonResponse } from "./transforms/removeToolsForJsonResponse.ts";
import { passthroughToolSchemas } from "./transforms/passthroughToolSchemas.js";

// Import persona prompts
import midijourneyPrompt from "./personas/midijourney.js";
import chickyTutorPrompt from "./personas/chickytutor.js";

// Import system prompts
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";

// Import model configs
import { portkeyConfig } from "./configs/modelConfigs.js";

import { type ModelId, resolveServiceId } from "../shared/registry/registry.js";
// Import registry for validation
import type { TEXT_SERVICES } from "../shared/registry/text.js";

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
        config: portkeyConfig["gpt-5.2-2025-12-11"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "qwen-coder",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "mistral",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "deepseek",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v3p2"],
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
        config: portkeyConfig["claude-sonnet-4-5-fallback"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "claude-large",
        config: portkeyConfig["claude-opus-4-5-fallback"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "gemini",
        config: portkeyConfig["gemini-3-flash-preview"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            sanitizeToolSchemas(),
            passthroughToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-fast",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            sanitizeToolSchemas(),
            passthroughToolSchemas(),
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "gemini-search",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            sanitizeToolSchemas(),
            passthroughToolSchemas(),
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v2.5"),
        ),
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
        config: portkeyConfig["sonar-reasoning-pro"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "kimi",
        config: portkeyConfig["kimi-k2-thinking-maas"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "gemini-large",
        config: portkeyConfig["gemini-3-pro-preview"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            sanitizeToolSchemas(),
            passthroughToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "gemini-legacy",
        config: portkeyConfig["gemini-2.5-pro"],
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.conversational),
            sanitizeToolSchemas(),
            passthroughToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "nova-fast",
        config: portkeyConfig["amazon.nova-micro-v1:0"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "glm",
        config: portkeyConfig["accounts/fireworks/models/glm-4p7"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "minimax",
        config: portkeyConfig["accounts/fireworks/models/minimax-m2p1"],
        transform: createSystemPromptTransform(BASE_PROMPTS.conversational),
    },
    {
        name: "nomnom",
        config: portkeyConfig["nomnom"],
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
        const resolvedServiceId = resolveServiceId(modelName);
        return (
            availableModels.find((model) => model.name === resolvedServiceId) ||
            null
        );
    } catch {
        return null;
    }
}
