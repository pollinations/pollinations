// Publishable key (safe to commit) - used in production
const PUBLISHABLE_KEY = "plln_pk_JYeNIYDfEi0dwDT7kPAXujYWyYT2TaKm";

// Use environment variable if available (local dev with secret key),
// otherwise fall back to publishable key (production)
const envKey = import.meta.env.VITE_POLLINATIONS_API_KEY;
export const API_KEY = envKey || PUBLISHABLE_KEY;

// Backend mode = secret key present (parallel API calls allowed)
// Frontend mode = publishable key (sequential calls with delays)
export const IS_BACKEND_MODE = !!envKey;

// Delay between sequential API calls in frontend mode (ms)
export const FRONTEND_CALL_DELAY = 3000;

// Log which key is being used (only first 15 chars for security)
const keyPreview = API_KEY.substring(0, 15) + "...";
const keySource = IS_BACKEND_MODE
    ? "environment (secret key) → parallel mode"
    : "fallback (publishable key) → sequential mode";
console.log(`🔑 API Key loaded from ${keySource}: ${keyPreview}`);

export const API = {
    TEXT_GENERATION:
        "https://enter.pollinations.ai/api/generate/v1/chat/completions",
    IMAGE_GENERATION: "https://enter.pollinations.ai/api/generate/image",
};

export const DEFAULTS = {
    IMAGE_MODEL: "flux",
    TEXT_MODEL: "openai-large",
    IMAGE_WIDTH: 400,
    IMAGE_HEIGHT: 400,
    SEED: 42,
};
