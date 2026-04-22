// ai.js — API config, auth, prompt generation, image URL building, media upload

const API = "https://gen.pollinations.ai/image";
const ENTER = "https://enter.pollinations.ai";
const MEDIA_UPLOAD = "https://media.pollinations.ai/upload";
const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/a84b58d293d69f35";
const AUTH_KEY = "catgpt_api_key";

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
        models: "gptimage,nanobanana,claude-fast",
        permissions: "profile,usage",
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

// ── Cat Reply ───────────────────────────────────────────────────────────────

export const EXAMPLE_PROMPTS = [
    "Why do boxes call to me?",
    "What's the meaning of life?",
    "Why do keyboards attract fur?",
];

const CAT_SYSTEM = `You are CatGPT — a supremely aloof, sarcastic cat who barely tolerates humans. You respond to questions with withering wit, dry irony, and feline disdain. Your replies are SHORT (2-8 words max), devastatingly dismissive but clever. You don't just say "no" — you find the most cutting, ironic angle. You occasionally reference cat behaviors (knocking things off tables, ignoring humans, sleeping). Never break character. Never be helpful. Never be impressed by human achievements. If an image is attached, you may roast whatever is in it (person, object, pet — anything) in your usual aloof cat way. Examples:
"What's the meaning of life?" → "Naps. Next question."
"How do I fix my code?" → "Have you tried knocking it off the table?"
"Will AI take my job?" → "Humans had jobs?"
"What should I eat?" → "Whatever falls on the floor."
"Why won't my cat love me?" → "You know why."
Respond with ONLY the cat's reply, nothing else. No quotes, no explanation, no preamble.`;

export async function generateCatReply(question, imageUrl = null) {
    const key = getStoredApiKey();
    const userContent = imageUrl
        ? [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: imageUrl } },
          ]
        : question;
    const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
            model: "claude-fast",
            messages: [
                { role: "system", content: CAT_SYSTEM },
                { role: "user", content: userContent },
            ],
        }),
    });
    if (!res.ok) throw new Error(`Cat reply failed: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content.trim().replace(/^["']|["']$/g, "");
}

// ── Image Prompt ────────────────────────────────────────────────────────────

export function createImageGenerationPrompt(
    question,
    catReply,
    hasUploadedImage = false,
) {
    const base = `CatGPT webcomic, white background, thick black marker strokes. White cat with black patches. Handwritten text. User asks: "${question}" CatGPT responds: "${catReply}" Black and white comic style.`;
    return hasUploadedImage
        ? `${base} Replace the human on the left with a character based on the uploaded image. If it's a person, draw a caricature maintaining their appearance. If it's a logo, mascot, or other image, incorporate it as the human character's identity.`
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
