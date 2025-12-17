// ==============================================
// API CONFIGURATION
// ==============================================

// Detect if we're on Cloudflare (production) - uses server-side proxy
const isCloudflare =
    typeof window !== "undefined" &&
    (window.location.hostname === "pollinations.ai" ||
        window.location.hostname === "hello.pollinations.ai" ||
        window.location.hostname.endsWith(".pages.dev"));

// Publishable key for local/dev only - Cloudflare uses server-side secret key
const HELLO_PUBLISHABLE_KEY = "plln_pk_3Li2tYoZizyJ9j2ELfgpv9vxdTIcB1gF";

// API_KEY: On Cloudflare, the Worker adds the key. Locally, use env or publishable.
const envSecretKey = import.meta.env.VITE_THEME_API_KEY;
export const API_KEY = isCloudflare
    ? ""
    : envSecretKey || HELLO_PUBLISHABLE_KEY;
export const IS_SECRET_KEY = !!envSecretKey;
export const IS_CLOUDFLARE = isCloudflare;

// ==============================================
// STARTUP LOGGING
// ==============================================

if (isCloudflare) {
    console.log(`🔐 [API] Using Cloudflare proxy (key hidden server-side)`);
} else {
    const keyType = IS_SECRET_KEY ? "🔑 secret" : "📢 publishable";
    console.log(
        `🔐 [API] Using ${keyType} key: ${API_KEY.substring(0, 12)}...`,
    );
}

// ==============================================
// API ENDPOINTS
// ==============================================

// On Cloudflare, use relative /api/* path (goes through Worker proxy)
// Locally, use direct enter.pollinations.ai URL
const API_BASE = isCloudflare ? "/api" : "https://enter.pollinations.ai/api";

export const API = {
    TEXT_GENERATION: `${API_BASE}/generate/v1/chat/completions`,
    IMAGE_GENERATION: `${API_BASE}/generate/image`,
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
