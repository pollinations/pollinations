/**
 * Allowed models for the playground.
 * Models not in these lists will be shown but grayed out and disabled.
 * Users will see a tooltip prompting them to log in to enter.pollinations.ai to access them.
 */

export const ALLOWED_IMAGE_MODELS = [
    "zimage",
    "flux",
    "turbo",
    "nanobanana",
    "gptimage",
];

export const ALLOWED_TEXT_MODELS = [
    "openai-fast",
    "qwen-coder",
    "mistral",
    "openai-audio",
    "gemini",
    "midijourney",
    "chickytutor",
    "grok",
    "deepseek",
    "claude-fast",
    "perplexity-fast",
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
