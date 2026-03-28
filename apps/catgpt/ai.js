// ai.js — API config, auth, prompt generation, image URL building, media upload

const API = "https://gen.pollinations.ai/image";
const ENTER = "https://enter.pollinations.ai";
const MEDIA_UPLOAD = "https://media.pollinations.ai/upload";
const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/a84b58d293d69f35";
const AUTH_KEY = "pollinations_api_key";

// ── Auth ─────────────────────────────────────────────────────────────────────

export const getStoredApiKey = () => {
    try {
        return localStorage.getItem(AUTH_KEY);
    } catch {
        return null;
    }
};
export const storeApiKey = (key) => localStorage.setItem(AUTH_KEY, key);
export const clearApiKey = () => localStorage.removeItem(AUTH_KEY);

export function extractApiKeyFromFragment() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    try {
        const key = new URLSearchParams(hash).get("api_key");
        return key && /^(sk_|plln_pk_|pk_)/.test(key) ? key : null;
    } catch {
        return null;
    }
}

export function getAuthorizeUrl() {
    const redirect = window.location.href.split("#")[0];
    return `${ENTER}/authorize?${new URLSearchParams({
        redirect_url: redirect,
        budget: "5",
        models: "gptimage,nanobanana",
        permissions: "profile,balance",
    })}`;
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

// ── Prompts ──────────────────────────────────────────────────────────────────

export const EXAMPLE_PROMPTS = [
    "Why do boxes call to me?",
    "What's the meaning of life?",
    "Why do keyboards attract fur?",
];

export function createImageGenerationPrompt(
    question,
    hasUploadedImage = false,
) {
    const pollinationsRule = /polli|invest/i.test(question)
        ? " The cat should be surprisingly positive about Pollinations but still dismissive and aloof."
        : "";
    const base = `CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. Handwritten text. User asks: "${question}" CatGPT responds sarcastically as an aloof cat with 2-5 word dismissive reply.${pollinationsRule} Black and white comic style.`;
    return hasUploadedImage
        ? `${base} Replace the human on the left with a caricature of the person in the uploaded image. Incorporate visible elements or landmarks from the uploaded image. Maintain their gender, ethnicity, and unique characteristics.`
        : `${base} Human with bob hair.`;
}

export function generateImageURL(prompt, model, imageUrl = null) {
    const key = getStoredApiKey();
    let url = `${API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=${model}&key=${encodeURIComponent(key)}`;

    if (imageUrl) {
        url += `&enhance=false&image=${encodeURIComponent(`${imageUrl},${SELFIE_CATGPT}`)}`;
    } else {
        url += `&enhance=true&image=${encodeURIComponent(ORIGINAL_CATGPT)}`;
    }
    return url;
}

// ── Models ──────────────────────────────────────────────────────────────────

const PREFERRED_MODEL = "nanobanana";
const FALLBACK_MODEL = "gptimage";

export async function pickModel(apiKey) {
    try {
        const res = await fetch(`https://gen.pollinations.ai/image/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return { model: FALLBACK_MODEL, isPremium: false };
        const models = await res.json();
        const names = models.map((m) => m.name);
        if (names.includes(PREFERRED_MODEL)) {
            return { model: PREFERRED_MODEL, isPremium: true };
        }
        return { model: FALLBACK_MODEL, isPremium: false };
    } catch {
        return { model: FALLBACK_MODEL, isPremium: false };
    }
}

// ── Media Upload ─────────────────────────────────────────────────────────────

export async function handleImageUpload(file, notify) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
        notify("Image too large! Please use an image under 5MB.", "error");
        return null;
    }

    try {
        notify("Uploading image...", "info");
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(MEDIA_UPLOAD, {
            method: "POST",
            headers: { Authorization: `Bearer ${getStoredApiKey()}` },
            body: form,
        });
        if (!res.ok) throw new Error("Upload failed");
        return (await res.json()).url;
    } catch (err) {
        console.error("Media upload failed:", err);
        notify("Upload failed. Trying local fallback...", "warning");
        try {
            return await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
        } catch {
            notify(
                "Could not process image. Please try a smaller image.",
                "error",
            );
            return null;
        }
    }
}
