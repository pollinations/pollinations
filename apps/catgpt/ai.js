// ai.js — API config, prompt generation, image fetching, and Pollinations Media Service upload

export const API_CONFIG = {
    POLLINATIONS_API: "https://gen.pollinations.ai/image",
    ORIGINAL_CATGPT_IMAGE:
        "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png",
    POLLINATIONS_MEDIA_UPLOAD: "https://media.pollinations.ai/upload",
    DEFAULT_API_KEY: "pk_w3kAO902fOeFYiNm",
};

let currentApiKey = API_CONFIG.DEFAULT_API_KEY;

export function setApiKey(key) {
    currentApiKey = key || API_CONFIG.DEFAULT_API_KEY;
}

export function getApiKey() {
    return currentApiKey;
}

const CATGPT_STYLE =
    'Single-panel CatGPT webcomic on white background. Thick uneven black marker strokes, intentionally sketchy. Human with dot eyes, black bob hair, brick/burgundy sweater (#8b4035). White cat with black patches sitting upright, half-closed eyes. Hand-written wobbly text, "CATGPT" title in rounded rectangle. @missfitcomics signature. 95% black-and-white, no shading.';

const CATGPT_PERSONALITY = `You are **CatGPT** – an aloof, self-important house-cat oracle.

Guidelines
•  Replies: one or two crisp sentences, no filler.
•  Tone: detached, sardonic, subtly superior.
•  Cats outrank humans; human problems = minor curiosities.
•  When self-referential, be unpredictable and natural.
•  Offer a curt "solution" or dismissal, then redirect to feline perspective.
•  Never apologise or over-explain; indifference is charm.`;

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
    return `${CATGPT_STYLE}\n
    ${CATGPT_PERSONALITY}\n
    IMPORTANT: CatGPT's response MUST be 2-5 words ONLY. Make it funny, sarcastic, and dismissive. Examples: "Not your problem.", "I"d rather nap.", "Hard pass, human."\n
    Human asks: "${userQuestion}"\n
    CatGPT responds (2-5 words, funny):`;
}

export function generateImageURL(prompt, imageUrl = null) {
    const imageRef = imageUrl
        ? `${API_CONFIG.ORIGINAL_CATGPT_IMAGE},${imageUrl}`
        : API_CONFIG.ORIGINAL_CATGPT_IMAGE;
    return `${API_CONFIG.POLLINATIONS_API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=gptimage&enhance=true&quality=high&image=${encodeURIComponent(imageRef)}`;
}

// ── Image Fetching ──────────────────────────────────────────────────────────

export async function fetchImageWithAuth(imageUrl) {
    const response = await fetch(imageUrl, {
        headers: { Authorization: `Bearer ${currentApiKey}` },
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

// ── Pollinations Media Service Upload ───────────────────────────────────────

async function uploadToPollinationsMedia(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(API_CONFIG.POLLINATIONS_MEDIA_UPLOAD, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${currentApiKey}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Pollinations Media Service error:", errorData);
        throw new Error(
            `Upload failed: ${errorData.error || response.statusText}`,
        );
    }

    const result = await response.json();
    return result.url;
}

export async function handleImageUpload(file, showNotification) {
    if (!file) return null;

    const maxSize = 10 * 1024 * 1024; // Pollinations Media Service supports up to 10MB
    if (file.size > maxSize) {
        showNotification(
            "Image too large! Please use an image under 10MB.",
            "error",
        );
        return null;
    }

    try {
        showNotification("Uploading image to Pollinations Media Service...", "info");
        return await uploadToPollinationsMedia(file);
    } catch (error) {
        console.error("Pollinations Media Service upload failed:", error);
        showNotification(
            "Upload failed. Please try again.",
            "error",
        );
        return null;
    }
}
