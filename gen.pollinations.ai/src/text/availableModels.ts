import { type ModelId, resolveModelName } from "@shared/registry/registry.ts";
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

const models: ModelDefinition[] = [
    {
        name: "openai",
        config: portkeyConfig["gpt-5.4-nano"],
    },
    {
        name: "openai-fast",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
    },
    {
        name: "openai-large",
        config: portkeyConfig["gpt-5.4"],
    },
    {
        name: "gpt-5.5",
        config: portkeyConfig["gpt-5.5"],
    },
    {
        name: "qwen-coder",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen-coder-large",
        config: portkeyConfig["qwen3-coder-next"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen-large",
        config: portkeyConfig["accounts/fireworks/models/qwen3p6-plus"],
    },
    {
        name: "qwen-vision",
        config: portkeyConfig[
            "accounts/fireworks/models/qwen3-vl-30b-a3b-thinking"
        ],
    },
    {
        name: "mistral",
        config: portkeyConfig["mistral-small-3.2-24b-instruct-2506"],
    },
    {
        name: "deepseek",
        config: portkeyConfig["deepseek-ai/DeepSeek-V4-Flash"],
    },
    {
        name: "deepseek-pro",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v4-pro"],
    },
    {
        name: "grok",
        config: portkeyConfig["grok-4-20-non-reasoning"],
    },
    {
        name: "grok-large",
        config: portkeyConfig["grok-4-20-reasoning"],
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-audio-mini-2025-12-15"],
    },
    {
        name: "openai-audio-large",
        config: portkeyConfig["gpt-audio-1.5"],
    },
    {
        name: "claude-fast",
        config: portkeyConfig["claude-haiku-4-5"],
    },
    {
        name: "claude",
        config: portkeyConfig["claude-sonnet-4-6"],
    },
    {
        name: "claude-large",
        config: portkeyConfig["claude-opus-4-6"],
    },
    {
        name: "claude-opus-4.7",
        config: portkeyConfig["claude-opus-4-7"],
    },
    {
        name: "gemini",
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
        name: "gemini-fast",
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
        name: "midijourney-large",
        config: portkeyConfig["claude-opus-4-6"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "perplexity-fast",
        config: portkeyConfig["sonar"],
    },
    {
        name: "perplexity-reasoning",
        config: portkeyConfig["sonar-reasoning-pro"],
    },
    {
        name: "kimi",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p5"],
    },
    {
        name: "kimi-k2.6",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p6"],
    },
    {
        name: "gemini-large",
        config: portkeyConfig["gemini-3.1-pro-preview"],
        transform: pipe(
            sanitizeToolSchemas(),
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "nova-fast",
        config: portkeyConfig["nova-micro"],
    },
    {
        name: "nova",
        config: portkeyConfig["nova-2-lite"],
    },
    {
        name: "glm",
        config: portkeyConfig["accounts/fireworks/models/glm-5p1"],
    },
    {
        name: "minimax",
        config: portkeyConfig["accounts/fireworks/models/minimax-m2p7"],
    },
    {
        name: "llama",
        config: portkeyConfig[
            "accounts/fireworks/models/llama-v3p3-70b-instruct"
        ],
    },
    {
        name: "mistral-large",
        config: portkeyConfig["Mistral-Large-3"],
    },
    {
        name: "polly",
        config: portkeyConfig["polly"],
    },
    {
        name: "qwen-safety",
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
