import { type ModelId, resolveServiceId } from "../shared/registry/registry.ts";
import { portkeyConfig } from "./configs/modelConfigs.js";
import midijourneyPrompt from "./personas/midijourney.js";
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";
import { createGeminiThinkingTransform } from "./transforms/createGeminiThinkingTransform.ts";
import { createGeminiToolsTransform } from "./transforms/createGeminiToolsTransform.ts";
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import { createSystemPromptTransform } from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { removeToolsForJsonResponse } from "./transforms/removeToolsForJsonResponse.ts";
import { sanitizeToolSchemas } from "./transforms/sanitizeToolSchemas.js";
import type { TransformFn } from "./types.js";

interface ModelDefinition {
    name: string;
    config: (typeof portkeyConfig)[ModelId];
    transform?: TransformFn;
}

const withConversational = createSystemPromptTransform(
    BASE_PROMPTS.conversational,
);

const models: ModelDefinition[] = [
    {
        name: "openai",
        config: portkeyConfig["gpt-5-mini"],
        transform: withConversational,
    },
    {
        name: "openai-fast",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
        transform: withConversational,
    },
    {
        name: "openai-large",
        config: portkeyConfig["gpt-5.2-2025-12-11"],
        transform: withConversational,
    },
    {
        name: "qwen-coder",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "mistral",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
        transform: withConversational,
    },
    {
        name: "deepseek",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v3p2"],
        transform: withConversational,
    },
    {
        name: "grok",
        config: portkeyConfig["myceli-grok-4-fast"],
        transform: withConversational,
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-4o-mini-audio-preview-2024-12-17"],
    },
    {
        name: "claude-fast",
        config: portkeyConfig["claude-haiku-4-5"],
        transform: withConversational,
    },
    {
        name: "claude",
        config: portkeyConfig["claude-sonnet-4-6"],
        transform: withConversational,
    },
    {
        name: "claude-large",
        config: portkeyConfig["claude-opus-4-6"],
        transform: withConversational,
    },
    {
        name: "claude-legacy",
        config: portkeyConfig["claude-opus-4-5"],
        transform: withConversational,
    },
    {
        name: "gemini",
        config: portkeyConfig["gemini-3-flash-preview"],
        transform: pipe(
            withConversational,
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-fast",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            withConversational,
            sanitizeToolSchemas(),
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "gemini-search",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "midijourney",
        config: portkeyConfig["gpt-5.2-2025-12-11"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "perplexity-fast",
        config: portkeyConfig["sonar"],
        transform: withConversational,
    },
    {
        name: "perplexity-reasoning",
        config: portkeyConfig["sonar-reasoning-pro"],
        transform: withConversational,
    },
    {
        name: "kimi",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p5"],
        transform: withConversational,
    },
    {
        name: "gemini-large",
        config: portkeyConfig["gemini-3.1-pro-preview"],
        transform: pipe(
            withConversational,
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "gemini-3-pro-preview",
        config: portkeyConfig["gemini-3-pro-preview"],
        transform: pipe(
            withConversational,
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "gemini-legacy",
        config: portkeyConfig["gemini-2.5-pro"],
        transform: pipe(
            withConversational,
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "nova-fast",
        config: portkeyConfig["nova-micro-fallback"],
        transform: withConversational,
    },
    {
        name: "glm",
        config: portkeyConfig["accounts/fireworks/models/glm-5"],
        transform: withConversational,
    },
    {
        name: "minimax",
        config: portkeyConfig["accounts/fireworks/models/minimax-m2p5"],
        transform: withConversational,
    },
    {
        name: "nomnom",
        config: portkeyConfig["nomnom"],
    },
    {
        name: "polly",
        config: portkeyConfig["polly"],
    },
    {
        name: "qwen-safety",
        config: portkeyConfig["Qwen3Guard-Gen-8B"],
    },
    {
        name: "qwen-character",
        config: portkeyConfig["qwen-character"],
        transform: createSystemPromptTransform(BASE_PROMPTS.character),
    },
];

export const availableModels = models;

export function findModelByName(modelName: string): ModelDefinition | null {
    const directMatch = availableModels.find(
        (model) => model.name === modelName,
    );
    if (directMatch) return directMatch;

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
