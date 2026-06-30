import { type ModelId, resolveModelName } from "@shared/registry/registry.ts";
import { portkeyConfig } from "./configs/modelConfigs.js";
import midijourneyPrompt from "./personas/midijourney.js";
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";
import { createClaudeThinkingTransform } from "./transforms/createClaudeThinkingTransform.ts";
import { createGeminiThinkingTransform } from "./transforms/createGeminiThinkingTransform.ts";
import { createGeminiToolsTransform } from "./transforms/createGeminiToolsTransform.ts";
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import { createPerplexitySearchTransform } from "./transforms/createPerplexitySearchTransform.ts";
import { createReasoningEffortTransform } from "./transforms/createReasoningEffortTransform.ts";
import { createSystemPromptTransform } from "./transforms/createSystemPromptTransform.js";
import { pipe } from "./transforms/pipe.js";
import { removeToolsForJsonResponse } from "./transforms/removeToolsForJsonResponse.ts";
import { sanitizeToolSchemas } from "./transforms/sanitizeToolSchemas.js";
import { stripCacheControl } from "./transforms/stripCacheControl.js";
import type { TransformFn } from "./types.js";

// Fireworks reasoning models: disable thinking via reasoning_effort:"none".
const fireworksThinking = createReasoningEffortTransform("toggle");
// MiniMax M2: reasoning is mandatory (rejects "none"/"minimal").
const mandatoryReasoning = createReasoningEffortTransform("mandatory");
// Models that 400/500 when reasoning_effort is forwarded (no reasoning mode).
const stripReasoning = createReasoningEffortTransform("strip");
// Claude families differ: Haiku 4.5 uses manual budget thinking; Sonnet/Opus
// 4.6+ use adaptive + output_config.effort.
const claudeManualThinking = createClaudeThinkingTransform("budget");
const claudeAdaptiveThinking = createClaudeThinkingTransform("adaptive");

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
        name: "gpt-5.4",
        config: portkeyConfig["gpt-5.4"],
    },
    {
        name: "gpt-5.4-mini",
        config: portkeyConfig["gpt-5.4-mini"],
    },
    {
        name: "openai-large",
        config: portkeyConfig["gpt-5.5"],
    },
    {
        name: "mercury",
        config: portkeyConfig["mercury-2"],
        transform: stripReasoning,
    },
    {
        name: "qwen-coder",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        // OVHcloud Qwen3-Coder 400s on reasoning_effort (no reasoning mode).
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.coding),
            stripReasoning,
        ),
    },
    {
        name: "qwen-coder-large",
        config: portkeyConfig["qwen/qwen3-coder-next"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen-large",
        config: portkeyConfig["accounts/fireworks/models/qwen3p7-plus"],
        transform: fireworksThinking,
    },
    {
        name: "qwen-vision",
        config: portkeyConfig["qwen/qwen3-vl-30b-a3b-instruct"],
        // Vision model, no reasoning mode.
        transform: stripReasoning,
    },
    {
        name: "qwen-vision-pro",
        config: portkeyConfig["qwen/qwen3-vl-235b-a22b-thinking"],
        // Reasoning mandatory: rejects "none" but accepts low/medium/high.
        transform: mandatoryReasoning,
    },
    {
        name: "step-3.5-flash",
        config: portkeyConfig["stepfun/step-3.5-flash"],
        transform: mandatoryReasoning,
    },
    {
        name: "step-flash",
        config: portkeyConfig["stepfun/step-3.7-flash"],
        transform: mandatoryReasoning,
    },
    {
        name: "mistral-small-3.2",
        config: portkeyConfig["mistral-small-2503"],
        // Mistral rejects reasoning_effort with 400; strip it.
        transform: pipe(stripCacheControl, stripReasoning),
    },
    {
        name: "mistral",
        config: portkeyConfig["mistral-small-2603"],
        transform: stripCacheControl,
    },
    {
        name: "deepseek",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v4-flash"],
        transform: fireworksThinking,
    },
    {
        name: "gemma",
        config: portkeyConfig["google/gemma-4-26b-a4b-it"],
    },
    {
        name: "deepseek-pro",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v4-pro"],
        transform: fireworksThinking,
    },
    {
        name: "grok",
        config: portkeyConfig["grok-4-20-non-reasoning"],
        // Non-reasoning deployment 500s if reasoning_effort is forwarded.
        transform: pipe(stripCacheControl, stripReasoning),
    },
    {
        name: "grok-4-20-reasoning",
        config: portkeyConfig["grok-4-20-reasoning"],
        transform: stripCacheControl,
    },
    {
        name: "grok-large",
        config: portkeyConfig["grok-4.3"],
        transform: stripCacheControl,
    },
    {
        name: "openai-audio",
        config: portkeyConfig["gpt-audio-mini-2025-12-15"],
        // Audio models don't support reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "openai-audio-large",
        config: portkeyConfig["gpt-audio-1.5"],
        transform: stripReasoning,
    },
    {
        name: "claude-fast",
        config: portkeyConfig["claude-haiku-4-5"],
        transform: claudeManualThinking,
    },
    {
        name: "claude",
        config: portkeyConfig["claude-sonnet-4-6"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "claude-sonnet-5",
        config: portkeyConfig["claude-sonnet-5"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "claude-opus-4.6",
        config: portkeyConfig["claude-opus-4-6"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "claude-opus-4.7",
        config: portkeyConfig["claude-opus-4-7"],
        // Opus 4.7/4.8 require adaptive thinking + output_config.effort.
        transform: claudeAdaptiveThinking,
    },
    {
        name: "claude-large",
        config: portkeyConfig["claude-opus-4-8"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "gemini-3-flash",
        config: portkeyConfig["gemini-3-flash-preview"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini",
        config: portkeyConfig["gemini-3.5-flash"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-flash-lite-3.1",
        config: portkeyConfig["gemini-3.1-flash-lite-preview"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-fast",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "gemini-search",
        config: portkeyConfig["gemini-2.5-flash-lite"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "gemini-search-fast",
        config: portkeyConfig["gemini-3.1-flash-lite-preview"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "gemini-search-large",
        config: portkeyConfig["gemini-3.5-flash"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "midijourney",
        config: portkeyConfig["gpt-5.4-mini"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "midijourney-large",
        config: portkeyConfig["gpt-5.5"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "perplexity-fast",
        config: portkeyConfig["sonar"],
        transform: createPerplexitySearchTransform("low"),
    },
    {
        name: "perplexity-deep",
        config: portkeyConfig["sonar"],
        transform: createPerplexitySearchTransform("high"),
    },
    {
        name: "perplexity",
        config: portkeyConfig["sonar-pro"],
        transform: createPerplexitySearchTransform("high"),
    },
    {
        name: "perplexity-reasoning",
        config: portkeyConfig["sonar-reasoning-pro"],
        transform: createPerplexitySearchTransform("high"),
    },
    {
        name: "kimi",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p6"],
        transform: pipe(stripCacheControl, fireworksThinking),
    },
    {
        name: "kimi-code",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p7-code"],
        transform: pipe(stripCacheControl, fireworksThinking),
    },
    {
        name: "gemini-large",
        config: portkeyConfig["gemini-3.1-pro-preview"],
        transform: pipe(
            sanitizeToolSchemas,
            createGeminiToolsTransform(["code_execution"]),
            removeToolsForJsonResponse,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "nova-fast",
        config: portkeyConfig["nova-micro"],
        // AWS Nova Micro doesn't support reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "nova",
        config: portkeyConfig["nova-2-lite"],
    },
    {
        name: "glm",
        config: portkeyConfig["accounts/fireworks/models/glm-5p2"],
        transform: pipe(stripCacheControl, fireworksThinking),
    },
    {
        name: "minimax-m2.7",
        config: portkeyConfig["accounts/fireworks/models/minimax-m2p7"],
        // Reasoning mandatory: rejects "none"/"minimal", accepts low/medium/high.
        transform: mandatoryReasoning,
    },
    {
        name: "minimax",
        config: portkeyConfig["accounts/fireworks/models/minimax-m3"],
        transform: fireworksThinking,
    },
    {
        name: "llama",
        config: portkeyConfig["Llama-3.3-70B-Instruct"],
        // No reasoning mode; Azure 422/400s on reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "llama-maverick",
        config: portkeyConfig["Llama-4-Maverick-17B-128E-Instruct-FP8"],
        transform: stripReasoning,
    },
    {
        name: "llama-scout",
        config: portkeyConfig["Llama-4-Scout-17B-16E-Instruct"],
        // No reasoning mode.
        transform: stripReasoning,
    },
    {
        name: "mistral-large",
        config: portkeyConfig["Mistral-Large-3"],
        // Azure deployment 500s on reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "polly",
        config: portkeyConfig["polly"],
    },
    {
        name: "qwen-safety",
        config: portkeyConfig["Qwen3Guard-Gen-8B"],
        // Safety/guard model, no reasoning mode.
        transform: stripReasoning,
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
