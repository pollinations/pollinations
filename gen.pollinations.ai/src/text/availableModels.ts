import { resolveModelName } from "@shared/registry/registry.ts";
import { portkeyConfig } from "./configs/modelConfigs.js";
import midijourneyPrompt from "./personas/midijourney.js";
import { BASE_PROMPTS } from "./prompts/systemPrompts.js";
import { createClaudeThinkingTransform } from "./transforms/createClaudeThinkingTransform.ts";
import { createGeminiThinkingTransform } from "./transforms/createGeminiThinkingTransform.ts";
import {
    adaptGoogleSearchToolForOpenRouter,
    adaptGoogleSearchToolForVertex,
    createGeminiToolsTransform,
} from "./transforms/createGeminiToolsTransform.ts";
import { createMessageTransform } from "./transforms/createMessageTransform.js";
import { createReasoningEffortTransform } from "./transforms/createReasoningEffortTransform.ts";
import { createSystemPromptTransform } from "./transforms/createSystemPromptTransform.js";
import { inputAudioToFireworks } from "./transforms/inputAudioToFireworks.js";
import { pipe } from "./transforms/pipe.js";
import { sanitizeToolSchemas } from "./transforms/sanitizeToolSchemas.js";
import type { TransformFn, TransformOptions } from "./types.js";

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
const claudeOpus5Thinking = createClaudeThinkingTransform("adaptive", true);

interface ModelDefinition {
    name: string;
    config: (options?: TransformOptions) => Record<string, unknown>;
    transform?: TransformFn;
    /** Route through the Azure Responses API instead of Chat Completions. */
    useResponsesApi?: boolean;
}

function usesGrokReasoning(options: TransformOptions): boolean {
    return (
        options.reasoning_effort !== undefined &&
        options.reasoning_effort !== "none"
    );
}

const grokTransform: TransformFn = (messages, options) =>
    usesGrokReasoning(options)
        ? { messages, options }
        : stripReasoning(messages, options);

const models: ModelDefinition[] = [
    {
        name: "openai/gpt-5.4-nano",
        config: portkeyConfig["gpt-5.4-nano"],
    },
    {
        name: "openai/gpt-5-nano",
        config: portkeyConfig["gpt-5-nano-2025-08-07"],
    },
    {
        name: "openai/gpt-oss-20b",
        config: portkeyConfig["gpt-oss-20b"],
    },
    {
        name: "openai/gpt-5.4",
        config: portkeyConfig["gpt-5.4"],
    },
    {
        name: "openai/gpt-5.4-mini",
        config: portkeyConfig["gpt-5.4-mini"],
    },
    {
        name: "openai/gpt-5.5",
        config: portkeyConfig["gpt-5.5"],
    },
    {
        name: "openai/gpt-5.6-sol",
        config: portkeyConfig["gpt-5.6-sol"],
        useResponsesApi: true,
    },
    {
        name: "openai/gpt-5.6-terra",
        config: portkeyConfig["gpt-5.6-terra"],
        useResponsesApi: true,
    },
    {
        name: "openai/gpt-5.6-luna",
        config: portkeyConfig["gpt-5.6-luna"],
        useResponsesApi: true,
    },
    {
        name: "inception/mercury-2",
        config: portkeyConfig["mercury-2"],
        transform: stripReasoning,
    },
    {
        name: "inception/mercury-2.5-preview",
        config: portkeyConfig["inception/mercury-2.5-preview"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "cohere/command-a-plus",
        config: portkeyConfig["Cohere-command-a-plus-05-2026"],
    },
    {
        name: "qwen/qwen3-coder-30b-a3b-instruct",
        config: portkeyConfig["qwen3-coder-30b-a3b-instruct"],
        // OVHcloud Qwen3-Coder 400s on reasoning_effort (no reasoning mode).
        transform: pipe(
            createSystemPromptTransform(BASE_PROMPTS.coding),
            stripReasoning,
        ),
    },
    {
        name: "qwen/qwen3-coder-next",
        config: portkeyConfig["qwen/qwen3-coder-next"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen/qwen3-coder-next:fallback",
        config: portkeyConfig["qwen-coder-large-openrouter-streamlake"],
        transform: createSystemPromptTransform(BASE_PROMPTS.coding),
    },
    {
        name: "qwen/qwen3.7-plus",
        config: portkeyConfig["qwen/qwen3.7-plus"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "qwen/qwen3.7-max",
        config: portkeyConfig["qwen/qwen3.7-max"],
    },
    {
        name: "qwen/qwen3.8-2.4t-a95b",
        config: portkeyConfig["accounts/fireworks/models/qwen3p8-2p4t-a95b"],
        transform: fireworksThinking,
    },
    {
        name: "qwen/qwen3.8-2.4t-a95b:fallback",
        config: portkeyConfig["Qwen/Qwen3.8-2.4T-A95B"],
        transform: fireworksThinking,
    },
    {
        name: "qwen/qwen3.8-27b",
        config: portkeyConfig["qwen/qwen3.8-27b"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "qwen/qwen3.8-27b:fallback",
        config: portkeyConfig["qwen3.8-27b-openrouter-akashml"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "qwen/qwen3.8-max",
        config: portkeyConfig["qwen/qwen3.8-max"],
    },
    {
        name: "qwen/qwen3.7-flash",
        config: portkeyConfig["qwen/qwen3.7-flash"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "qwen/qwen3-vl-30b-a3b-instruct",
        config: portkeyConfig["qwen/qwen3-vl-30b-a3b-instruct"],
        // Vision model, no reasoning mode.
        transform: stripReasoning,
    },
    {
        name: "qwen/qwen3-vl-235b-a22b-thinking",
        config: portkeyConfig["qwen3-vl-235b-a22b-thinking"],
        // Alibaba thinking-only model; strip "none" to preserve always-on reasoning.
        transform: mandatoryReasoning,
    },
    {
        name: "qwen/qwen3-vl-235b-a22b-thinking:fallback",
        config: portkeyConfig["qwen-vision-pro-openrouter-novita"],
        transform: mandatoryReasoning,
    },
    {
        name: "stepfun/step-3.5-flash",
        config: portkeyConfig["stepfun/step-3.5-flash"],
        transform: mandatoryReasoning,
    },
    {
        name: "stepfun/step-3.7-flash",
        config: portkeyConfig["stepfun-ai/Step-3.7-Flash"],
        transform: mandatoryReasoning,
    },
    {
        name: "mistralai/mistral-small-3.2",
        config: portkeyConfig["mistral-small-2503"],
        // Mistral rejects reasoning_effort with 400; strip it.
        transform: stripReasoning,
    },
    {
        name: "mistralai/mistral-small-4",
        config: portkeyConfig["mistral-small-2603"],
    },
    {
        name: "mistralai/mistral-small-4:fallback",
        config: portkeyConfig["mistral-openrouter-eu"],
    },
    {
        name: "deepseek/deepseek-v4-flash",
        config: portkeyConfig[
            "accounts/fireworks/models/deepseek-v4-flash-0731"
        ],
        transform: fireworksThinking,
    },
    {
        name: "deepseek/deepseek-v4-flash:fallback",
        config: portkeyConfig["deepseek-ai/DeepSeek-V4-Flash-0731"],
        transform: fireworksThinking,
    },
    {
        name: "deepseek/deepseek-v4-flash-vision-exp",
        config: portkeyConfig[
            "accounts/fireworks/models/deepseek-v4-flash-vision-exp"
        ],
        transform: fireworksThinking,
    },
    {
        name: "google/gemma-4-26b-a4b-it",
        config: portkeyConfig["google/gemma-4-26b-a4b-it"],
    },
    {
        name: "google/gemma-4-26b-a4b-it:fallback",
        config: portkeyConfig["google/gemma-4-26B-A4B-it"],
    },
    {
        name: "google/gemma-4-31b-it",
        config: portkeyConfig["google/gemma-4-31b-it"],
    },
    {
        name: "google/gemma-4-31b-it:fallback",
        config: portkeyConfig["google/gemma-4-31B-it"],
    },
    {
        name: "deepseek/deepseek-v4-pro",
        config: portkeyConfig["accounts/fireworks/models/deepseek-v4-pro-0813"],
        transform: fireworksThinking,
    },
    {
        name: "x-ai/grok-4.20",
        config: (options = {}) =>
            (usesGrokReasoning(options)
                ? portkeyConfig["grok-4-20-reasoning"]
                : portkeyConfig["grok-4-20-non-reasoning"])(),
        transform: grokTransform,
    },
    {
        name: "x-ai/grok-4.20:fallback",
        config: portkeyConfig["grok-openrouter-xai-zdr"],
        transform: grokTransform,
    },
    {
        name: "x-ai/grok-4.3",
        config: portkeyConfig["grok-4.3"],
    },
    {
        name: "x-ai/grok-4.3:fallback",
        config: portkeyConfig["grok-large-openrouter-xai-zdr"],
    },
    {
        name: "x-ai/grok-4.6",
        config: portkeyConfig["grok-4.6"],
    },
    {
        name: "openai/gpt-audio-mini",
        config: portkeyConfig["gpt-audio-mini-2025-12-15"],
        // Audio models don't support reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "openai/gpt-audio-1.5",
        config: portkeyConfig["gpt-audio-1.5"],
        transform: stripReasoning,
    },
    {
        name: "anthropic/claude-haiku-4.5",
        config: portkeyConfig["claude-haiku-4-5"],
        transform: claudeManualThinking,
    },
    {
        name: "anthropic/claude-haiku-4.5:fallback",
        config: portkeyConfig["claude-fast-openrouter-vertex"],
        transform: claudeManualThinking,
    },
    {
        name: "anthropic/claude-sonnet-4.6",
        config: portkeyConfig["claude-sonnet-4-6"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-sonnet-5",
        config: portkeyConfig["claude-sonnet-5"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-opus-4.6",
        config: portkeyConfig["claude-opus-4-6"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-opus-4.7",
        config: portkeyConfig["claude-opus-4-7"],
        // Opus 4.7/4.8 require adaptive thinking + output_config.effort.
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-opus-4.7:fallback",
        config: portkeyConfig["claude-opus-4.7-openrouter-vertex"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-opus-5",
        config: portkeyConfig["claude-opus-5"],
        transform: claudeOpus5Thinking,
    },
    {
        name: "anthropic/claude-fable-5",
        config: portkeyConfig["claude-fable-5"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-fable-5:fallback",
        config: portkeyConfig["claude-fable-5-openrouter-vertex"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "anthropic/claude-fable-5.1",
        config: portkeyConfig["anthropic/claude-fable-5.1"],
        transform: claudeAdaptiveThinking,
    },
    {
        name: "google/gemini-3-flash-preview",
        config: portkeyConfig["google/gemini-3-flash-preview"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "google/gemini-3.7-flash",
        config: portkeyConfig["google/gemini-3.7-flash"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            // Gemini 3.7 requires reasoning; map `none` to its lowest level.
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "google/gemini-3.7-flash:fallback",
        config: portkeyConfig["gemini-openrouter-ai-studio-priority"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "google/gemini-3.5-flash-lite",
        config: portkeyConfig["google/gemini-3.5-flash-lite"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "google/gemini-3.5-flash-lite:fallback",
        config: portkeyConfig[
            "gemini-flash-lite-3.5-openrouter-ai-studio-flex"
        ],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-flash"),
        ),
    },
    {
        name: "google/gemini-2.5-flash-lite",
        config: portkeyConfig["google/gemini-2.5-flash-lite"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "google/gemini-2.5-flash-lite:fallback",
        config: portkeyConfig["gemini-fast-openrouter-ai-studio"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "google/gemini-2.5-flash-lite:search",
        config: portkeyConfig["vertex/gemini-2.5-flash-lite"],
        transform: pipe(
            sanitizeToolSchemas,
            adaptGoogleSearchToolForVertex,
            createGeminiToolsTransform(["google_search"]),
            createGeminiThinkingTransform("v2.5"),
        ),
    },
    {
        name: "pollinations/midijourney",
        config: portkeyConfig["gpt-5.4-mini"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "pollinations/midijourney-large",
        config: portkeyConfig["gpt-5.5"],
        transform: createMessageTransform(midijourneyPrompt),
    },
    {
        name: "perplexity/sonar",
        config: portkeyConfig["sonar"],
    },
    {
        name: "perplexity/sonar-pro",
        config: portkeyConfig["sonar-pro"],
    },
    {
        name: "perplexity/sonar-reasoning-pro",
        config: portkeyConfig["sonar-reasoning-pro"],
    },
    {
        name: "moonshotai/kimi-k2.6",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p6"],
        transform: fireworksThinking,
    },
    {
        name: "moonshotai/kimi-k2.6:fallback",
        config: portkeyConfig["moonshotai/Kimi-K2.6"],
        transform: fireworksThinking,
    },
    {
        name: "moonshotai/kimi-k2.7-code",
        config: portkeyConfig["accounts/fireworks/models/kimi-k2p7-code"],
        transform: fireworksThinking,
    },
    {
        name: "moonshotai/kimi-k2.7-code:fallback",
        config: portkeyConfig["kimi-code-deepinfra"],
        transform: fireworksThinking,
    },
    {
        name: "moonshotai/kimi-k3",
        config: portkeyConfig["accounts/fireworks/models/kimi-k3"],
        transform: fireworksThinking,
    },
    {
        name: "poolside/laguna-s-2.1",
        config: portkeyConfig["poolside/laguna-s-2.1"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "meituan/longcat-2.0",
        config: portkeyConfig["meituan/longcat-2.0"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "thinkingmachines/inkling-small",
        config: portkeyConfig["thinkingmachines/inkling-small"],
    },
    {
        name: "thinkingmachines/inkling",
        config: portkeyConfig["accounts/fireworks/models/inkling"],
        transform: pipe(inputAudioToFireworks, mandatoryReasoning),
    },
    {
        name: "nvidia/nemotron-3-ultra",
        config: portkeyConfig["nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B"],
        transform: createReasoningEffortTransform("toggle"),
    },
    {
        name: "nvidia/nemotron-3.5-lightning",
        config: portkeyConfig[
            "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b"
        ],
        transform: fireworksThinking,
    },
    {
        name: "nvidia/nemotron-3.5-lightning:fallback",
        config: portkeyConfig["nemotron-3.5-lightning-openrouter-coreweave"],
        transform: fireworksThinking,
    },
    {
        name: "xiaomi/mimo-v2.5",
        config: portkeyConfig["xiaomi/mimo-v2.5"],
    },
    {
        name: "xiaomi/mimo-v2.5-pro",
        config: portkeyConfig["xiaomi/mimo-v2.5-pro"],
    },
    {
        name: "google/gemini-3.1-pro-preview",
        config: portkeyConfig["google/gemini-3.1-pro-preview"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "google/gemini-3.1-pro-preview:fallback",
        config: portkeyConfig["gemini-large-openrouter-ai-studio"],
        transform: pipe(
            adaptGoogleSearchToolForOpenRouter,
            createGeminiThinkingTransform("v3-pro"),
        ),
    },
    {
        name: "amazon/nova-micro-v1",
        config: portkeyConfig["nova-micro"],
        // AWS Nova Micro doesn't support reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "amazon/nova-2-lite-v1",
        config: portkeyConfig["nova-2-lite"],
    },
    {
        name: "z-ai/glm-5.2",
        config: portkeyConfig["accounts/fireworks/models/glm-5p2"],
        transform: fireworksThinking,
    },
    {
        name: "z-ai/glm-5.3",
        config: portkeyConfig["accounts/fireworks/models/glm-5p3"],
        // Reasoning is mandatory; off requests keep the upstream default.
        transform: mandatoryReasoning,
    },
    {
        name: "z-ai/glm-5.3:fallback",
        config: portkeyConfig["glm-5.3-openrouter-friendli"],
        transform: mandatoryReasoning,
    },
    {
        name: "z-ai/glm-5.3-flash",
        config: portkeyConfig["accounts/fireworks/models/glm-5p3-flash"],
        // Reasoning is mandatory; off requests keep the upstream default.
        transform: mandatoryReasoning,
    },
    {
        name: "minimax/minimax-m2.7",
        config: portkeyConfig["minimax/minimax-m2.7"],
        // Reasoning mandatory: rejects "none"/"minimal", accepts low/medium/high.
        transform: mandatoryReasoning,
    },
    {
        name: "minimax/minimax-m2.7:fallback",
        config: portkeyConfig["MiniMaxAI/MiniMax-M2.7"],
        transform: mandatoryReasoning,
    },
    {
        name: "minimax/minimax-m3",
        config: portkeyConfig["accounts/fireworks/models/minimax-m3"],
        transform: fireworksThinking,
    },
    {
        name: "meta/muse-glimmer-30b",
        config: portkeyConfig["accounts/fireworks/models/muse-glimmer-30b"],
        transform: fireworksThinking,
    },
    {
        name: "meta/muse-glimmer-30b:fallback",
        config: portkeyConfig["muse-glimmer-openrouter-deepinfra"],
        transform: fireworksThinking,
    },
    {
        name: "meta/muse-spark-1.2",
        config: portkeyConfig["meta/muse-spark-1.2"],
    },
    {
        name: "meta/llama-3.3-70b-instruct",
        config: portkeyConfig["Llama-3.3-70B-Instruct"],
        // No reasoning mode; Azure 422/400s on reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "meta/llama-3.3-70b-instruct:fallback",
        config: portkeyConfig["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
        transform: stripReasoning,
    },
    {
        name: "meta/llama-4-maverick",
        config: portkeyConfig["Llama-4-Maverick-17B-128E-Instruct-FP8"],
        transform: stripReasoning,
    },
    {
        name: "meta/llama-4-scout",
        config: portkeyConfig["Llama-4-Scout-17B-16E-Instruct"],
        // No reasoning mode.
        transform: stripReasoning,
    },
    {
        name: "meta/llama-4-scout:fallback",
        config: portkeyConfig["llama-scout-openrouter-deepinfra"],
        transform: stripReasoning,
    },
    {
        name: "mistralai/mistral-large-3",
        config: portkeyConfig["Mistral-Large-3"],
        // Azure deployment 500s on reasoning_effort.
        transform: stripReasoning,
    },
    {
        name: "mistralai/mistral-large-3:fallback",
        config: portkeyConfig["mistral-large-openrouter-zdr"],
        transform: stripReasoning,
    },
    {
        name: "qwen/qwen3guard-gen-8b",
        config: portkeyConfig["Qwen3Guard-Gen-8B"],
        // Safety/guard model, no reasoning mode.
        transform: stripReasoning,
    },
];

export const availableModels = models;

export function findModelByName(modelName: string): ModelDefinition | null {
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
