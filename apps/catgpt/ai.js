// ai.js — API config, auth, prompt generation, image URL building, media upload

const API = "https://gen.pollinations.ai/image";
const ENTER = "https://enter.pollinations.ai";
const MEDIA = "https://media.pollinations.ai";
const MEDIA_UPLOAD = `${MEDIA}/upload`;
const ORIGINAL_CATGPT =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/main/apps/catgpt/images/original-catgpt.png";
const SELFIE_CATGPT = "https://media.pollinations.ai/657d58ee4c9c22d7";
const AUTH_KEY = "catgpt_api_key";
const APP_KEY = "pk_uWjreBEkxFAhjDHo";

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
        app_key: APP_KEY,
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
export const fetchKeyInfo = (apiKey) => fetchAccount(apiKey, "key");

export async function resolveAppKeyId() {
    const res = await fetch(
        `${ENTER}/api/app-lookup?${new URLSearchParams({ app_key: APP_KEY })}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.found ? data.clientId : null;
}

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
        ? `${base} Replace the human on the left with a quick rough sketch caricature of the uploaded image, drawn in the SAME loose hand-drawn black marker style as the cat — simple outlines only, NO shading, NO color, NO photorealism, NO detailed rendering, just a wobbly sketch with the same line weight and amateur charm as the rest of the comic. If it's a logo, mascot, or other non-person image, sketch it in the same crude marker style.`
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

function appendCatalogFields(form, options = {}) {
    if (options.visibility) form.append("visibility", options.visibility);
    if (options.relationship) form.append("relationship", options.relationship);
    for (const tag of options.tags || []) form.append("tags", tag);
    for (const parent of options.parents || []) form.append("parents", parent);
}

function authHeader() {
    return { Authorization: `Bearer ${getStoredApiKey()}` };
}

function isMediaUrl(url) {
    if (!url) return false;
    try {
        return new URL(url).hostname === "media.pollinations.ai";
    } catch {
        return false;
    }
}

async function uploadMediaBlob(blob, filename, options = {}) {
    const form = new FormData();
    form.append("file", blob, filename);
    appendCatalogFields(form, options);
    const res = await fetch(MEDIA_UPLOAD, {
        method: "POST",
        headers: authHeader(),
        body: form,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
}

export async function uploadGeneratedMeme(blob, parentUrl = null) {
    const parents = isMediaUrl(parentUrl) ? [parentUrl] : [];
    const media = await uploadMediaBlob(blob, `catgpt-${Date.now()}.png`, {
        visibility: "public",
        relationship: "catgpt_reply",
        tags: ["catgpt", "meme"],
        parents,
    });
    return media.url || `${MEDIA}/${media.id}`;
}

export async function fetchMyMedia() {
    const res = await fetch(`${MEDIA}/me/media?limit=50`, {
        headers: authHeader(),
    });
    if (!res.ok) throw new Error("Could not load media");
    return res.json();
}

export async function fetchAppMedia() {
    const appKeyId = await resolveAppKeyId();
    if (!appKeyId) return { items: [] };
    const res = await fetch(
        `${MEDIA}/apps/${encodeURIComponent(appKeyId)}/media?limit=50`,
    );
    if (!res.ok) throw new Error("Could not load app media");
    return res.json();
}

export async function handleImageUpload(file, notify) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
        notify("Image too large! Please use an image under 5MB.", "error");
        return null;
    }

    try {
        notify("Uploading image...", "info");
        const media = await uploadMediaBlob(file, file.name || "catgpt.png", {
            visibility: "unlisted",
            tags: ["catgpt", "source"],
        });
        return media.url || `${MEDIA}/${media.id}`;
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
