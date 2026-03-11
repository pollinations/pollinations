// ai.js — API config, prompt generation, image fetching, and media upload

export const API_CONFIG = {
    POLLINATIONS_API: "https://gen.pollinations.ai/image",
    ORIGINAL_CATGPT_IMAGE:
        "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png",
    MEDIA_UPLOAD_URL: "https://media.pollinations.ai/upload",
    ENTER_URL: "https://enter.pollinations.ai",
    DEFAULT_API_KEY: "pk_w3kAO902fOeFYiNm",
};

// ── BYOP Auth ─────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = "pollinations_api_key";

export function getStoredApiKey() {
    try {
        return localStorage.getItem(AUTH_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function storeApiKey(key) {
    localStorage.setItem(AUTH_STORAGE_KEY, key);
}

export function clearApiKey() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getActiveApiKey() {
    return getStoredApiKey() || API_CONFIG.DEFAULT_API_KEY;
}

export function isLoggedIn() {
    return !!getStoredApiKey();
}

/**
 * Check URL fragment for API key returned from enter.pollinations.ai/authorize
 * Returns the key if found, null otherwise.
 */
export function extractApiKeyFromFragment() {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;

    try {
        const params = new URLSearchParams(hash);
        const key = params.get("api_key");
        if (key && /^(sk_|plln_pk_|pk_)/.test(key)) {
            return key;
        }
    } catch {
        // ignore parse errors
    }
    return null;
}

export function getAuthorizeUrl() {
    const currentUrl = window.location.href.split("#")[0];
    return `${API_CONFIG.ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}&permissions=profile,balance`;
}

export async function fetchProfile(apiKey) {
    const res = await fetch(`${API_CONFIG.ENTER_URL}/api/account/profile`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
    return res.json();
}

export async function fetchBalance(apiKey) {
    const res = await fetch(`${API_CONFIG.ENTER_URL}/api/account/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Balance fetch failed: ${res.status}`);
    return res.json();
}

export const EXAMPLE_PROMPTS = [
    "Why do boxes call to me?",
    "What's the meaning of life?",
    "Why do keyboards attract fur?",
];

// ── Prompt Generation ───────────────────────────────────────────────────────

export function createImageGenerationPrompt(
    userQuestion,
    hasUploadedImage = false,
) {
    if (hasUploadedImage) {
        return `Single-panel CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. The human character should look like the person in the uploaded photo. Handwritten text. "${userQuestion}" CatGPT responds sarcastically as an aloof cat with 2-5 word dismissive reply. Black and white comic style.`;
    }
    return `Single-panel CatGPT webcomic, white background, thick black marker strokes. White cat with black patches, human with bob hair. Handwritten text. "${userQuestion}" CatGPT responds sarcastically as an aloof cat with 2-5 word dismissive reply. Black and white comic style.`;
}

export function generateImageURL(prompt, imageUrl = null) {
    const apiKey = getActiveApiKey();
    const model = isLoggedIn() ? "nanobanana" : "gptimage";
    const imageRef = imageUrl
        ? `${imageUrl},${API_CONFIG.ORIGINAL_CATGPT_IMAGE}`
        : API_CONFIG.ORIGINAL_CATGPT_IMAGE;
    return `${API_CONFIG.POLLINATIONS_API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=${model}&enhance=true&image=${encodeURIComponent(imageRef)}&key=${encodeURIComponent(apiKey)}`;
}

// ── Media Upload (replaces Cloudinary) ────────────────────────────────────

async function uploadToMedia(file) {
    const apiKey = getActiveApiKey();
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(API_CONFIG.MEDIA_UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Media upload error:", errorData);
        throw new Error(`Upload failed: ${errorData.error || "Unknown error"}`);
    }

    return (await response.json()).url;
}

export async function handleImageUpload(file, showNotification) {
    if (!file) return null;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification(
            "Image too large! Please use an image under 5MB.",
            "error",
        );
        return null;
    }

    try {
        showNotification("Uploading image...", "info");
        return await uploadToMedia(file);
    } catch (error) {
        console.error("Media upload failed:", error);
        showNotification(
            "Cloud upload failed. Trying local method...",
            "warning",
        );
        try {
            const dataUri = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            if (dataUri.length > 500000) {
                showNotification(
                    "Image may be too large for reliable use. Results might vary.",
                    "warning",
                );
            }
            return dataUri;
        } catch (fallbackError) {
            showNotification(
                "Could not process image. Please try a smaller image.",
                "error",
            );
            console.error("Base64 fallback failed:", fallbackError);
            return null;
        }
    }
}
