/**
 * Allowed models for the playground when NOT logged in.
 * When logged in, all models returned by the API are allowed (API filters by key permissions).
 * Models not in these lists will be shown but grayed out and disabled for anonymous users.
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
 * When logged in: all models are allowed (API already filters by key permissions)
 * When not logged in: only models in the static allowlist are available
 */
export function isModelAllowed(
    modelId: string,
    type: "image" | "text",
    isLoggedIn: boolean,
): boolean {
    // When logged in, all models from API are allowed
    if (isLoggedIn) return true;

    // When not logged in, use static allowlist
    const allowedList =
        type === "image" ? ALLOWED_IMAGE_MODELS : ALLOWED_TEXT_MODELS;
    return allowedList.includes(modelId);
}

/**
 * Tooltip message shown when hovering over a grayed-out model
 */
export const GATED_MODEL_TOOLTIP =
    "To test this model, log in to enter.pollinations.ai";
