// ==============================================
// API CONFIGURATION
// ==============================================
// Direct calls to gen.pollinations.ai. Users must log in and use their own
// API key (sk_ / pk_ issued via enter.pollinations.ai) to generate.

export const APP_KEY = "pk_5F0qxjbCjlgBODHa"; // BYOP app key for authorization flow
export const API_BASE = "https://gen.pollinations.ai";

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
