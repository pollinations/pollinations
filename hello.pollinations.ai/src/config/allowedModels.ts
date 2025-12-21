/**
 * Allowed models for the playground.
 * Models not in these lists will be shown but grayed out and disabled.
 * Users will see a tooltip prompting them to log in to enter.pollinations.ai to access them.
 */

export const ALLOWED_IMAGE_MODELS = ["zimage", "flux", "turbo", "nanobanana"];

export const ALLOWED_TEXT_MODELS = [
    "nova-micro",
    "gemini",
    "gemini-fast",
    "kimi-k2-thinking",
    "perplexity-fast",
    "midijourney",
    "claude-fast",
    "chickytutor",
    "grok",
    "deepseek",
    "qwen-coder",
    "mistral",
    "openai-fast",
    "openai-audio",
];

/**
 * Check if a model is allowed for the playground
 */
export function isModelAllowed(
    modelId: string,
    type: "image" | "text",
): boolean {
    const allowedList =
        type === "image" ? ALLOWED_IMAGE_MODELS : ALLOWED_TEXT_MODELS;
    return allowedList.includes(modelId);
}

/**
 * Tooltip message shown when hovering over a grayed-out model
 */
export const GATED_MODEL_TOOLTIP =
    "To test this model, log in to enter.pollinations.ai";
