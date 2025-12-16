// ==============================================
// API KEYS
// ==============================================

// Single publishable key for deployed site (playground, logos, theme fallback)
const HELLO_PUBLISHABLE_KEY = "plln_pk_3Li2tYoZizyJ9j2ELfgpv9vxdTIcB1gF";

// API_KEY: Uses secret key from env if available, otherwise publishable key
// For local dev with secret key, add to .env: VITE_THEME_API_KEY=plln_sk_...
const envSecretKey = import.meta.env.VITE_THEME_API_KEY;
export const API_KEY = envSecretKey || HELLO_PUBLISHABLE_KEY;
export const IS_SECRET_KEY = !!envSecretKey;

// ==============================================
// STARTUP LOGGING
// ==============================================

const keyType = IS_SECRET_KEY ? "🔑 secret" : "📢 publishable";
console.log(`🔐 [API] Using ${keyType} key: ${API_KEY.substring(0, 12)}...`);

// ==============================================
// API ENDPOINTS
// ==============================================

export const API = {
    TEXT_GENERATION:
        "https://enter.pollinations.ai/api/generate/v1/chat/completions",
    IMAGE_GENERATION: "https://enter.pollinations.ai/api/generate/image",
};

// ==============================================
// DEFAULTS
// ==============================================

export const DEFAULTS = {
    IMAGE_MODEL: "flux",
    TEXT_MODEL: "openai-large",
    IMAGE_WIDTH: 400,
    IMAGE_HEIGHT: 400,
    SEED: 42,
};
