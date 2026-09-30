// ai.js — Pollinations Krita plugin: API config, auth, image generation

// Security: API key is kept in volatile module memory only (never persisted
// to localStorage). After OAuth redirect the key is extracted from the URL
// fragment once, then the fragment is cleared. Page reload requires
// re-authentication — this is intentional to eliminate clear-text credential
// storage (CodeQL alert: "Clear text storage of sensitive information").

const API = "https://gen.pollinations.ai/image";
const ENTER = "https://enter.pollinations.ai";
const MEDIA = "https://media.pollinations.ai";
const APP_KEY = "pk_krita_plugin_v1";

// ── Auth (in-memory, volatile) ───────────────────────────────────────────────

let _apiKey = null;

export const getApiKey = () => _apiKey;
export const setApiKey = (key) => {
    _apiKey = key;
};
export const resetApiKey = () => {
    _apiKey = null;
};
export const clearApiKey = resetApiKey; // alias for script.js compatibility

export function extractApiKeyFromFragment() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    try {
        const key = new URLSearchParams(hash).get("api_key");
        if (key && /^(sk_|plll_pk_|pk_)/.test(key)) {
            setApiKey(key);
            return key;
        }
        return null;
    } catch {
        return null;
    }
}

export function getAuthorizeUrl(prompt = "") {
    const redirect = window.location.href.split("#")[0];
    const params = new URLSearchParams({
        redirect_url: redirect,
        app_key: APP_KEY,
        budget: "5",
        models: "openai/gpt-image-1-mini,google/gemini-3.1-flash-lite-image,google/gemini-2.5-flash-image,anthropic/claude-haiku-4.5",
        permissions: "profile,usage",
    });
    if (prompt) params.set("prompt", encodeURIComponent(prompt));
    return `${ENTER}/authorize?${params}`;
}

async function fetchAccount(apiKey, path) {
    const res = await fetch(`${ENTER}/api/account/${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
    return res.json();
}

export const fetchProfile = (apiKey) => fetchAccount(apiKey, "profile");
export const fetchBalance = (apiKey) => fetchAccount(apiKey, "balance");

// ── Image Models ─────────────────────────────────────────────────────────────

const PREFERRED_MODELS = ["nanobanana-2-lite", "nanobanana"];
const FALLBACK_MODEL = "gptimage";

export async function pickModel(apiKey) {
    try {
        const res = await fetch("https://gen.pollinations.ai/image/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return { model: FALLBACK_MODEL, isPremium: false };
        const models = await res.json();
        for (const preferred of PREFERRED_MODELS) {
            if (
                models.some(
                    (m) =>
                        m.name === preferred || m.aliases?.includes(preferred),
                )
            ) {
                return { model: preferred, isPremium: true };
            }
        }
        return { model: FALLBACK_MODEL, isPremium: false };
    } catch {
        return { model: FALLBACK_MODEL, isPremium: false };
    }
}

// ── Image URL Building ───────────────────────────────────────────────────────

export function generateImageURL(prompt, model, options = {}) {
    const key = getApiKey();
    const params = new URLSearchParams({
        width: String(options.width || 1024),
        height: String(options.height || 1024),
        model: model || FALLBACK_MODEL,
        nologo: "true",
        private: "true",
    });
    if (key) params.set("key", key);

    const url = `${API}/${encodeURIComponent(prompt)}?${params}`;

    if (options.image) {
        // img2img: send reference image URL for editing
        const imgParam = `${encodeURIComponent(options.image)},`;
        return `${url}&image=${imgParam}&enhance=true&redirect=false`;
    }

    return `${url}&enhance=true&redirect=false`;
}

// ── Media Upload (for Krita canvas → web) ────────────────────────────────────

export async function uploadImage(file, notify) {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) {
        notify("Image too large! Please use an image under 10MB.", "error");
        return null;
    }
    try {
        notify("Uploading to Krita plugin...", "info");
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${MEDIA}/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getApiKey()}` },
            body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        return data.url;
    } catch (err) {
        console.error("Upload failed:", err);
        notify("Upload failed. Trying local preview...", "warning");
        try {
            return await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
        } catch {
            notify("Could not process image.", "error");
            return null;
        }
    }
}

// ── Canvas Presets ───────────────────────────────────────────────────────────

export const CANVAS_PRESETS = [
    { name: "1024×1024", width: 1024, height: 1024, aspect: "square" },
    { name: "768×1024", width: 768, height: 1024, aspect: "portrait" },
    { name: "1024×768", width: 1024, height: 768, aspect: "landscape" },
    { name: "A4 2480×3508", width: 2480, height: 3508, aspect: "portrait" },
    { name: "A3 3508×4961", width: 3508, height: 4961, aspect: "portrait" },
    { name: "4K 2160×3840", width: 2160, height: 3840, aspect: "portrait" },
];
