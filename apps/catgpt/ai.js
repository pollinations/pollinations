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
    return `${API_CONFIG.ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}`;
}

export const EXAMPLES_MAP = new Map([
    [
        "What is my horoscope? I am gemini. And don't say napping",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22What%20is%20my%20horoscope%3F%20I%20am%20gemini.%20And%20don't%20say%20napping%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "what is the answer to life and the universe?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22what%20is%20the%20answer%20to%20life%20and%20the%20universe%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Should I take up the offer for a new job?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Should%20I%20take%20up%20the%20offer%20for%20a%20new%20job%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Can you help me exercise?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Can%20you%20help%20me%20exercise%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Where should we eat in Palermo Sicily?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Where%20should%20we%20eat%20in%20Palermo%20Sicily%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Why do boxes call to me?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Why%20do%20boxes%20call%20to%20me%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Can you communicate with dolphins?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Can%20you%20communicate%20with%20dolphins%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "Why do keyboards attract fur?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22Why%20do%20keyboards%20attract%20fur%3F%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
    [
        "What's the weather today?",
        "https://gen.pollinations.ai/image/Single-panel%20CatGPT%20webcomic%2C%20white%20background%2C%20thick%20black%20marker%20strokes.%20White%20cat%20with%20black%20patches%2C%20human%20with%20bob%20hair.%20Handwritten%20text.%20%22what's%20the%20weather%20today%22%20CatGPT%20responds%20sarcastically%20as%20an%20aloof%20cat.%20Black%20and%20white%20comic%20style.?height=1024&width=1024&model=gptimage&enhance=true&image=https%3A%2F%2Fraw.githubusercontent.com%2Fpollinations%2Fcatgpt%2Frefs%2Fheads%2Fmain%2Fimages%2Foriginal-catgpt.png",
    ],
]);

// ── Prompt Generation ───────────────────────────────────────────────────────

export function createImageGenerationPrompt(userQuestion) {
    return `Single-panel CatGPT webcomic, white background, thick black marker strokes. White cat with black patches, human with bob hair. Handwritten text. "${userQuestion}" CatGPT responds sarcastically as an aloof cat with 2-5 word dismissive reply. Black and white comic style.`;
}

export function generateImageURL(prompt, imageUrl = null) {
    const imageRef = imageUrl
        ? `${API_CONFIG.ORIGINAL_CATGPT_IMAGE},${imageUrl}`
        : API_CONFIG.ORIGINAL_CATGPT_IMAGE;
    return `${API_CONFIG.POLLINATIONS_API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=gptimage&enhance=true&quality=high&image=${encodeURIComponent(imageRef)}`;
}

// ── Image Fetching ──────────────────────────────────────────────────────────

export async function fetchImageWithAuth(imageUrl) {
    const apiKey = getActiveApiKey();
    const response = await fetch(imageUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("API Error:", {
            status: response.status,
            details: errorText,
            url: imageUrl,
        });
        throw new Error(`API_ERROR_${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
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
