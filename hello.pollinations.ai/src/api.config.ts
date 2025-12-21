// ==============================================
// API CONFIGURATION
// ==============================================
// Direct calls to gen.pollinations.ai with publishable key.
// No proxy needed - publishable keys are safe to expose on frontend.

export const API_KEY = "pk_lubo2q2DIYpPh5Dd";
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
    TEXT_MODEL: "openai-large",
    IMAGE_WIDTH: 400,
    IMAGE_HEIGHT: 400,
    SEED: 42,
};
