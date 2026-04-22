import { resolveModelName } from "../shared/registry/registry.ts";
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
    config: (typeof portkeyConfig)[keyof typeof portkeyConfig];
    transform?: TransformFn;
}

const models: ModelDefinition[] = [
    {
        name: "gpt-5.4-nano",
        config: portkeyConfig["gpt-5.4-nano"],
    },
    {
        name: "gpt-5-nano",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
    },
    {
        name: "gpt-5.4",
        config: portkeyConfig["gpt-5.4"],
    },
    {
        name: "qwen3-coder-30b",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen3-coder-next",
        config: portkeyConfig["qwen3-coder-next"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen3.6-plus",
        config: portkeyConfig["accounts/fireworks/models/qwen3p6-plus"],
    },
    {
        name: "qwen3-vl-thinking",
        config: portkeyConfig[
            "accounts/fireworks/models/qwen3-vl-30b-a3b-thinking"
        ],
    },
    {
        name: "mistral-small-3.2",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
    },
    {
        name: "deepseek-v3.2",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v3p2"],
    },
    {
        name: "grok-4.1-fast",
        config: portkeyConfig["grok-4-1-fast-non-reasoning"],
    },
    {
        name: "grok-4.20-reasoning",
        config: portkeyConfig["grok-4-20-reasoning"],
    },
    {
        name: "gpt-audio-mini",
        config: portkeyConfig["gpt-audio-mini-2025-12-15"],
    },
    {
        name: "gpt-audio-1.5",
        config: portkeyConfig["gpt-audio-1.5"],
    },
    {
        name: "claude-haiku-4.5",
        config: portkeyConfig["claude-haiku-4-5"],
    },
    {
        name: "claude-sonnet-4.6",
        config: portkeyConfig["claude-sonnet-4-6"],
    },
    {
        name: "claude-opus-4.6",
        config: portkeyConfig["claude-opus-4-6"],
    },
    {
        name: "claude-opus-4.7",
        config: portkeyConfig["claude-opus-4-7"],
    },
    {
        name: "gemini-3-flash",
        config: portkeyConfig["gemini-3-flash-preview"],
        transform: pipe(
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-flash-lite-3.1",
        config: portkeyConfig["gemini-3.1-flash-lite-preview"],
        transform: pipe(
            sanitizeToolSchemas(),
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-2.5-flash-lite",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
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
        config: portkeyConfig["claude-haiku-4-5"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "midijourney-pro",
        config: portkeyConfig["claude-opus-4-6"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "perplexity-sonar",
        config: portkeyConfig["sonar"],
    },
    {
        name: "perplexity-sonar-reasoning-pro",
        config: portkeyConfig["sonar-reasoning-pro"],
    },
    {
        name: "kimi-k2.5",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p5"],
    },
    {
        name: "kimi-k2.6",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p6"],
    },
    {
        name: "gemini-3.1-pro",
        config: portkeyConfig["gemini-3.1-pro-preview"],
        transform: pipe(
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "nova-micro-1",
        config: portkeyConfig["nova-micro-fallback"],
    },
    {
        name: "nova-2-lite",
        config: portkeyConfig["nova-2-lite"],
    },
    {
        name: "glm-5.1",
        config: portkeyConfig["accounts/fireworks/models/glm-5p1"],
    },
    {
        name: "minimax-m2.7",
        config: portkeyConfig["accounts/fireworks/models/minimax-m2p7"],
    },
    {
        name: "mistral-large-3",
        config: portkeyConfig["Mistral-Large-3"],
    },
    {
        name: "polly",
        config: portkeyConfig["polly"],
    },
    {
        name: "qwen3-guard-8b",
        config: portkeyConfig["Qwen3Guard-Gen-8B"],
    },
];

export const availableModels = models;

export function findModelByName(modelName: string): ModelDefinition | null {
    const directMatch = availableModels.find(
        (model) => model.name === modelName,
    );
    if (directMatch) return directMatch;

    try {
        const resolvedModelName = resolveModelName(modelName);
        return (
            availableModels.find((model) => model.name === resolvedModelName) ||
            null
        );
    } catch {
        return null;
    }
}
