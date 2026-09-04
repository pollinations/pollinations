// ==============================================
// API CONFIGURATION
// ==============================================
// Direct calls to gen.pollinations.ai. Users must log in and use their own
// API key (sk_ / pk_ issued via enter.pollinations.ai) to generate.

// Registered redirect URIs for this key: https://pollinations.ai/play plus
// the loopback http://localhost/play and http://127.0.0.1/play for local dev.
// Enter matches loopback URIs port-agnostically and treats loopback hostnames
// as interchangeable, so both `npm run dev` and `npm run dev -- --host 127.0.0.1`
// authorize against the local site.
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
