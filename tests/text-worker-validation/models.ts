/**
 * Text model definitions extracted from shared/registry/text.ts.
 * Update this file if models change in the registry.
 */

export interface TextModel {
    id: string;
    modelId: string;
    inputModalities: string[];
    outputModalities: string[];
    tools?: boolean;
    reasoning?: boolean;
    search?: boolean;
    paidOnly?: boolean;
    hidden?: boolean;
    alpha?: boolean;
    voices?: string[];
    provider: string;
}

export const TEXT_MODELS: TextModel[] = [
    // --- OpenAI (Azure) ---
    { id: "openai", modelId: "gpt-5-mini", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, provider: "azure" },
    { id: "openai-fast", modelId: "gpt-5-nano-2025-08-07", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, provider: "azure" },
    { id: "openai-large", modelId: "gpt-5.2-2025-12-11", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, reasoning: true, paidOnly: true, provider: "azure" },
    { id: "openai-audio", modelId: "gpt-4o-mini-audio-preview-2024-12-17", inputModalities: ["text", "image", "audio"], outputModalities: ["audio", "text"], tools: true, voices: ["alloy", "nova", "shimmer"], provider: "azure" },

    // --- Anthropic Claude ---
    { id: "claude-fast", modelId: "claude-haiku-4-5-20251001", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, provider: "anthropic" },
    { id: "claude", modelId: "claude-sonnet-4-6", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, paidOnly: true, provider: "anthropic" },
    { id: "claude-large", modelId: "claude-opus-4-6", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, paidOnly: true, provider: "anthropic" },
    { id: "claude-legacy", modelId: "claude-opus-4-5-20251101", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, paidOnly: true, hidden: true, provider: "anthropic" },

    // --- Google Gemini (Vertex AI) ---
    { id: "gemini", modelId: "gemini-3-flash-preview", inputModalities: ["text", "image", "audio", "video"], outputModalities: ["text"], tools: true, search: true, paidOnly: true, provider: "google" },
    { id: "gemini-fast", modelId: "gemini-2.5-flash-lite", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, search: true, provider: "google" },
    { id: "gemini-search", modelId: "gemini-2.5-flash-lite", inputModalities: ["text", "image"], outputModalities: ["text"], search: true, provider: "google" },
    { id: "gemini-large", modelId: "gemini-3.1-pro-preview", inputModalities: ["text", "image", "audio", "video"], outputModalities: ["text"], tools: true, reasoning: true, search: true, paidOnly: true, provider: "google" },
    { id: "gemini-3-pro-preview", modelId: "gemini-3-pro-preview", inputModalities: ["text", "image", "audio", "video"], outputModalities: ["text"], tools: true, reasoning: true, search: true, paidOnly: true, hidden: true, provider: "google" },
    { id: "gemini-legacy", modelId: "gemini-2.5-pro", inputModalities: ["text", "image", "audio", "video"], outputModalities: ["text"], tools: true, reasoning: true, search: true, paidOnly: true, hidden: true, provider: "google" },

    // --- Fireworks AI ---
    { id: "deepseek", modelId: "accounts/fireworks/models/deepseek-v3p2", inputModalities: ["text"], outputModalities: ["text"], tools: true, reasoning: true, provider: "fireworks" },
    { id: "kimi", modelId: "accounts/fireworks/models/kimi-k2p5", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, reasoning: true, provider: "fireworks" },
    { id: "glm", modelId: "accounts/fireworks/models/glm-5", inputModalities: ["text"], outputModalities: ["text"], tools: true, reasoning: true, provider: "fireworks" },
    { id: "minimax", modelId: "accounts/fireworks/models/minimax-m2p5", inputModalities: ["text"], outputModalities: ["text"], tools: true, reasoning: true, provider: "fireworks" },

    // --- OVHcloud ---
    { id: "mistral", modelId: "Mistral-Small-3.2-24B-Instruct-2506", inputModalities: ["text"], outputModalities: ["text"], tools: true, provider: "ovhcloud" },
    { id: "qwen-coder", modelId: "qwen3-coder-30b-a3b-instruct", inputModalities: ["text"], outputModalities: ["text"], tools: true, provider: "ovhcloud" },
    { id: "qwen-safety", modelId: "Qwen3Guard-Gen-8B", inputModalities: ["text"], outputModalities: ["text"], provider: "ovhcloud" },

    // --- Perplexity ---
    { id: "perplexity-fast", modelId: "sonar", inputModalities: ["text"], outputModalities: ["text"], search: true, provider: "perplexity" },
    { id: "perplexity-reasoning", modelId: "sonar-reasoning-pro", inputModalities: ["text"], outputModalities: ["text"], reasoning: true, search: true, provider: "perplexity" },

    // --- Azure (other) ---
    { id: "grok", modelId: "grok-4-fast-non-reasoning", inputModalities: ["text"], outputModalities: ["text"], tools: true, paidOnly: true, provider: "azure" },

    // --- AWS Bedrock ---
    { id: "nova-fast", modelId: "amazon.nova-micro-v1:0", inputModalities: ["text"], outputModalities: ["text"], tools: true, provider: "aws" },

    // --- Community / Alpha ---
    { id: "nomnom", modelId: "nomnom", inputModalities: ["text"], outputModalities: ["text"], tools: true, search: true, alpha: true, provider: "community" },
    { id: "polly", modelId: "polly", inputModalities: ["text", "image"], outputModalities: ["text"], tools: true, search: true, alpha: true, provider: "community" },
    { id: "midijourney", modelId: "gpt-5.2-2025-12-11", inputModalities: ["text"], outputModalities: ["text"], tools: true, provider: "azure" },

    // --- Airforce ---
    { id: "step-3.5-flash", modelId: "step-3.5-flash:free", inputModalities: ["text"], outputModalities: ["text"], alpha: true, provider: "airforce" },
    { id: "qwen-character", modelId: "qwen-character", inputModalities: ["text"], outputModalities: ["text"], alpha: true, provider: "airforce" },
];
