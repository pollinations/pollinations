// ==============================================
// API CONFIGURATION
// ==============================================
// Direct calls to gen.pollinations.ai. Users must log in and use their own
// API key (sk_ / pk_ issued via enter.pollinations.ai) to generate.

// Local redirects registered for this key: http://localhost/play and
// http://127.0.0.1/play. Each accepts any port; the hostname must match.
export const APP_KEY = "pk_5F0qxjbCjlgBODHa"; // BYOP app key for authorization flow
export const API_BASE = "https://gen.pollinations.ai";

export const API = {
    TEXT_GENERATION: `${API_BASE}/v1/chat/completions`,
};

// ==============================================
// DEFAULTS
// ==============================================

export const DEFAULTS = {
    TEXT_MODEL: "nova-fast",
};
