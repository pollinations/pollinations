// ==============================================
// API CONFIGURATION
// ==============================================
// Direct calls to gen.pollinations.ai with publishable key.
// No proxy needed - publishable keys are safe to expose on frontend.

export const DEFAULT_API_KEY = "pk_iOJLArs0DLNG7EGm"; // Anonymous API access (rate-limited)
export const APP_KEY = "pk_5F0qxjbCjlgBODHa"; // BYOP app key for authorization flow
export const API_BASE = "https://gen.pollinations.ai";

// Re-export for backward compatibility (use getApiKey() from useAuth for dynamic key)
export const API_KEY = DEFAULT_API_KEY;

export const API = {
    TEXT_GENERATION: `${API_BASE}/v1/chat/completions`,
    IMAGE_GENERATION: `${API_BASE}/image`,
};

// ==============================================
// DEFAULTS
// ==============================================

export const DEFAULTS = {
    IMAGE_MODEL: "flux",
    TEXT_MODEL: "nova-fast",
    IMAGE_WIDTH: 400,
    IMAGE_HEIGHT: 400,
    SEED: 42,
};
