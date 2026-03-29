// CatGPT Meme Generator — UI, state, and DOM logic

import {
    clearApiKey,
    createImageGenerationPrompt,
    EXAMPLE_PROMPTS,
    extractApiKeyFromFragment,
    fetchBalance,
    fetchProfile,
    generateImageURL,
    getAuthorizeUrl,
    getStoredApiKey,
    handleImageUpload,
    pickModel,
    storeApiKey,
} from "./ai.js";

// ── Constants ────────────────────────────────────────────────────────────────

const CAT_FACTS = [
    "Cats spend 70% of their lives sleeping 😴",
    "A group of cats is called a 'clowder' 🐱🐱🐱",
    "Cats have over 20 vocalizations 🎵",
    "The first cat in space was French 🚀",
    "Cats can rotate their ears 180 degrees 👂",
];

const PROGRESS_MESSAGES = [
    "🧠 Waking up CatGPT...",
    "☕ Brewing digital coffee for maximum sass...",
    "🎨 Sketching with chaotic energy...",
    "😼 Teaching AI the art of being unimpressed...",
    "📝 Writing sarcastic responses...",
    "✨ Sprinkling some magic dust...",
    "🎯 Perfecting the level of 'couldn't care less'...",
    "🔥 Making it fire (but like, ironically)...",
    "💅 Polishing those aloof vibes...",
    "🚀 Almost done! (CatGPT doesn't rush for anyone)",
];

const CELEBRATION_EMOJIS = ["🎉", "✨", "🌟", "💫", "🎊"];
const FLOATING_EMOJIS = ["🐱", "💭", "✨", "🌟", "😸", "🐾", "💜", "🎨"];
const CAT_EMOJIS = [
    "🐱",
    "😺",
    "😸",
    "😹",
    "😻",
    "🙀",
    "😿",
    "😾",
    "🐈",
    "🐈‍⬛",
];

const KONAMI_SEQUENCE =
    "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── DOM ──────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove("hidden");
const hide = (el) => el?.classList.add("hidden");

const dom = {
    userInput: $("userInput"),
    generateBtn: $("generateBtn"),
    generateError: $("generateError"),
    resultSection: $("resultSection"),
    generatedMeme: $("generatedMeme"),
    downloadBtn: $("downloadBtn"),
    shareBtn: $("shareBtn"),
    examplesGrid: $("examplesGrid"),
    yourMemesGrid: $("yourMemesGrid"),
    imageUpload: $("imageUpload"),
    imageUploadContainer: $("imageUploadContainer"),
    imageThumbnailContainer: $("imageThumbnailContainer"),
    imageThumbnail: $("imageThumbnail"),
    removeImageBtn: $("removeImageBtn"),
};

// ── State ────────────────────────────────────────────────────────────────────

let uploadedImageUrl = null;
let currentAbort = null;
let progressInterval = null;
let progressStep = 0;
let catAnimInterval = null;
let konamiBuffer = [];

// ── Notifications ────────────────────────────────────────────────────────────

const NOTIF_COLORS = {
    success: "#A8E6A2",
    error: "#C9A9E4",
    info: "#E8F372",
    warning: "#E8F372",
};

function notify(message, type = "info") {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; max-width: 280px;
        padding: 0.6rem 1rem; background: ${NOTIF_COLORS[type] || NOTIF_COLORS.info};
        color: #110518; border: 2px solid #110518; border-right-width: 4px;
        border-bottom-width: 4px; font-size: 0.85rem; font-weight: 500;
        box-shadow: 4px 4px 0 rgba(17,5,24,0.12); z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

// ── URL State ────────────────────────────────────────────────────────────────

function getURLParams() {
    const p = new URLSearchParams(window.location.search);
    return {
        prompt: p.get("prompt"),
        image: p.get("image"),
        model: p.get("model"),
    };
}

function setURLPrompt(prompt) {
    const url = new URL(window.location);
    if (prompt) {
        url.searchParams.set("prompt", prompt);
        url.searchParams.set("model", activeModel);
        uploadedImageUrl
            ? url.searchParams.set("image", uploadedImageUrl)
            : url.searchParams.delete("image");
    } else {
        url.searchParams.delete("prompt");
        url.searchParams.delete("model");
        url.searchParams.delete("image");
    }
    window.history.replaceState({}, "", url);
}

// ── Model ───────────────────────────────────────────────────────────────────

const MODEL_STORAGE_KEY = "catgpt-model";
let activeModel = localStorage.getItem(MODEL_STORAGE_KEY) || "gptimage";

function setActiveModel(model) {
    activeModel = model;
    localStorage.setItem(MODEL_STORAGE_KEY, model);
}

// ── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "catgpt-generated";

function getSavedMemes() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

function saveGeneratedMeme(prompt, url) {
    const saved = getSavedMemes();
    const updated = [
        { prompt, url, model: activeModel },
        ...saved.filter((m) => m.prompt !== prompt),
    ].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

// ── Animations ───────────────────────────────────────────────────────────────

function startCatAnimation() {
    catAnimInterval = setInterval(() => {
        const cat = document.createElement("div");
        cat.style.cssText = `
            position: fixed; font-size: ${2 + Math.random() * 2}rem; z-index: 999;
            pointer-events: none; top: ${Math.random() * 100}vh; left: -100px;
            animation: catSlide ${3 + Math.random() * 2}s linear forwards;
        `;
        cat.textContent = pick(CAT_EMOJIS);
        document.body.appendChild(cat);
        setTimeout(() => cat.parentNode && cat.remove(), 6000);
    }, 400);
}

function stopCatAnimation() {
    clearInterval(catAnimInterval);
    catAnimInterval = null;
    for (const el of document.querySelectorAll("[style*='catSlide']"))
        el.remove();
}

function celebrate() {
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const el = document.createElement("div");
            el.textContent = pick(CELEBRATION_EMOJIS);
            el.style.cssText = `
                position: fixed; left: ${Math.random() * 100}%; top: -50px;
                font-size: ${20 + Math.random() * 20}px;
                animation: fall ${2 + Math.random() * 2}s ease-in forwards;
                z-index: 999; pointer-events: none;
            `;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 4000);
        }, i * 100);
    }
}

function addFloatingEmojis() {
    const container = document.querySelector(".container");
    FLOATING_EMOJIS.forEach((emoji, i) => {
        const el = document.createElement("div");
        el.textContent = emoji;
        el.style.cssText = `
            position: absolute; font-size: 2rem; opacity: 0.15; pointer-events: none; z-index: -1;
            animation: float ${10 + i * 2}s infinite ease-in-out ${i * 2}s;
        `;
        container.appendChild(el);
    });
}

// ── UI Helpers ───────────────────────────────────────────────────────────────

function scrollToGenerator() {
    requestAnimationFrame(() => {
        const section = document.querySelector(".generator-section");
        window.scrollTo({
            top: section.getBoundingClientRect().top + window.scrollY,
            behavior: "smooth",
        });
    });
}

function updateGenerateButtonState() {
    const hasText = dom.userInput.value.trim().length > 0;
    dom.generateBtn.disabled =
        !hasText && !dom.generateBtn.classList.contains("generating");
}

function setInputsDisabled(disabled) {
    dom.userInput.disabled = disabled;
    dom.userInput.classList.toggle("disabled", disabled);
}

function setButtonLoading() {
    dom.generateBtn.classList.add("generating");
    hide(dom.resultSection);
    progressStep = 0;
    setButtonMessage(PROGRESS_MESSAGES[0]);
    startCatAnimation();
    progressInterval = setInterval(() => {
        progressStep++;
        setButtonMessage(
            progressStep < PROGRESS_MESSAGES.length
                ? PROGRESS_MESSAGES[progressStep]
                : "🎨 Finalizing...",
        );
    }, 2500);
}

function setButtonMessage(msg) {
    dom.generateBtn.textContent = "";
    dom.generateBtn.appendChild(document.createTextNode(`${msg} `));
    const cancel = document.createElement("span");
    cancel.textContent = "Cancel?";
    cancel.style.color = "#c0392b";
    dom.generateBtn.appendChild(cancel);
}

function resetButton() {
    dom.generateBtn.classList.remove("generating", "retrying");
    dom.generateBtn.textContent = "Generate Meme";
    currentAbort = null;
    stopCatAnimation();
    setInputsDisabled(false);
    updateGenerateButtonState();
    clearInterval(progressInterval);
    progressInterval = null;
}

// ── URL Sanitization ─────────────────────────────────────────────────────────

function sanitizeUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
        const parsed = new URL(url, window.location.href);
        return ["http:", "https:", "blob:", "data:"].includes(parsed.protocol)
            ? parsed.toString()
            : null;
    } catch {
        return null;
    }
}

// ── Cards ────────────────────────────────────────────────────────────────────

function createMemeCard(prompt, index, imageUrl) {
    const safeUrl = sanitizeUrl(imageUrl);
    if (!safeUrl) return null;

    const card = document.createElement("div");
    card.className = "example-card";
    card.style.animationDelay = `${index * 0.1}s`;

    const img = document.createElement("img");
    img.src = safeUrl;
    img.alt = prompt;
    img.loading = "lazy";
    card.appendChild(img);

    const p = document.createElement("p");
    p.textContent = `"${prompt}"`;
    card.appendChild(p);

    card.addEventListener("click", () => {
        dom.userInput.value = prompt;
        updateGenerateButtonState();
        scrollToGenerator();
        dom.userInput.focus();
        notify("Prompt loaded! Hit Generate 🎨");
    });

    return card;
}

function loadUserMemes() {
    dom.yourMemesGrid.innerHTML = "";
    const saved = getSavedMemes();

    if (!saved.length) {
        const p = document.createElement("p");
        p.textContent = "No memes yet! Generate one to see it here. 🎨";
        p.style.cssText =
            "grid-column: 1/-1; text-align: center; color: var(--color-muted); padding: 2rem; font-style: italic;";
        dom.yourMemesGrid.appendChild(p);
        return;
    }

    saved.forEach((meme, i) => {
        const card = createMemeCard(meme.prompt, i, meme.url);
        if (card) dom.yourMemesGrid.appendChild(card);
    });
}

function loadExamples() {
    dom.examplesGrid.innerHTML = "";
    EXAMPLE_PROMPTS.forEach((q, i) => {
        const card = createMemeCard(
            q,
            i,
            generateImageURL(createImageGenerationPrompt(q), activeModel),
        );
        if (card) dom.examplesGrid.appendChild(card);
    });
}

// ── Generator ────────────────────────────────────────────────────────────────

async function generateMeme() {
    if (dom.generateBtn.classList.contains("generating")) {
        if (currentAbort) currentAbort();
        resetButton();
        return;
    }

    const question = dom.userInput.value.trim();
    if (!question) {
        notify("Please enter a question for CatGPT! 😸", "warning");
        return;
    }

    setURLPrompt(question);
    setButtonLoading();
    setInputsDisabled(true);
    hide(dom.generateError);
    dom.generateError.textContent = "";

    const imageUrl = generateImageURL(
        createImageGenerationPrompt(question, !!uploadedImageUrl),
        activeModel,
        uploadedImageUrl,
    );
    let cancelled = false;
    currentAbort = () => {
        cancelled = true;
    };

    try {
        const response = await fetch(imageUrl);
        if (cancelled) return;

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text.slice(0, 200) || `Error ${response.status}`);
        }

        // Use the pollinations URL directly (shareable, cacheable)
        await response.blob(); // ensure the image is fully loaded
        if (cancelled) return;
        dom.generatedMeme.src = imageUrl;

        resetButton();
        show(dom.resultSection);
        scrollToGenerator();
        celebrate();
        saveGeneratedMeme(question, imageUrl);
        loadUserMemes();
    } catch (error) {
        if (cancelled) return;
        console.error("Generation error:", error);
        resetButton();
        dom.generateError.textContent =
            error.message || "Failed to generate meme. Please try again.";
        show(dom.generateError);
    }
}

// ── Download / Share ─────────────────────────────────────────────────────────

async function downloadMeme() {
    try {
        const blob = await (await fetch(dom.generatedMeme.src)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `catgpt-meme-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        notify("Meme downloaded! 🎉", "success");
    } catch {
        notify(
            "Download failed! Try right-clicking and save image instead.",
            "error",
        );
    }
}

async function shareMeme() {
    if (!dom.generatedMeme.src) {
        notify("Generate a meme first! 🎨", "warning");
        return;
    }
    try {
        await navigator.clipboard.writeText(window.location.href);
        notify(
            "Link copied! Recipients will see the meme auto-generate 📋",
            "success",
        );
    } catch {
        notify("Could not copy link. Try copying it manually! 🔗", "error");
    }
}

// ── BYOP Auth ────────────────────────────────────────────────────────────────

const TIER_EMOJIS = { seed: "🌱", flower: "🌸", nectar: "🍯" };

function handleAuthRedirect() {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    storeApiKey(key);
    window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
    );
    notify("Logged in! Using your Pollen balance now.", "success");
}

async function updateAuthUI({ skipModelPick = false } = {}) {
    const loggedOutEl = $("authLoggedOut");
    const loggedInEl = $("authLoggedIn");
    if (!loggedOutEl || !loggedInEl) return;

    $("authLoginBtn").onclick = () => {
        window.location.href = getAuthorizeUrl();
    };
    $("authLogoutBtn").onclick = () => {
        clearApiKey();
        updateAuthUI();
        notify("Logged out. Log in to use CatGPT.");
    };

    const generatorSection = document.querySelector(".generator-section");
    const heroHeader = document.querySelector("header");

    const apiKey = getStoredApiKey();
    if (!apiKey) {
        show(loggedOutEl);
        hide(loggedInEl);
        hide(generatorSection);
        show(heroHeader);
        return;
    }

    hide(loggedOutEl);
    show(loggedInEl);
    show(generatorSection);
    hide(heroHeader);
    $("authApiKey").textContent = `${apiKey.substring(0, 4)}••••••••`;

    // Pick best available model (skip if URL param already set one)
    if (!skipModelPick) {
        pickModel(apiKey).then(({ model, isPremium }) => {
            setActiveModel(model);
            const upsellEl = $("modelUpsell");
            isPremium ? hide(upsellEl) : show(upsellEl);
        });
    }

    try {
        const [profile, balance] = await Promise.all([
            fetchProfile(apiKey).catch(() => null),
            fetchBalance(apiKey).catch(() => null),
        ]);

        if (profile) {
            const name = profile.githubUsername || profile.name || "User";
            $("authUserName").textContent = name;
            $("authUserEmail").textContent = profile.email || "";

            const avatarImg = $("authAvatar");
            const avatarFallback = $("authAvatarFallback");
            if (profile.image) {
                avatarImg.src = profile.image;
                show(avatarImg);
                hide(avatarFallback);
            } else {
                hide(avatarImg);
                show(avatarFallback);
                avatarFallback.textContent = name.charAt(0).toUpperCase();
            }

            const tier = profile.tier;
            $("authTier").textContent =
                tier && TIER_EMOJIS[tier]
                    ? `${TIER_EMOJIS[tier]} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
                    : "Free";
        }

        if (balance) {
            $("authBalance").textContent =
                `${balance.balance.toFixed(2)} pollen`;
        }
    } catch {
        clearApiKey();
        updateAuthUI();
        notify("Session expired. Please log in again.", "warning");
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function setupEventListeners() {
    dom.generateBtn.addEventListener("click", generateMeme);
    dom.downloadBtn.addEventListener("click", downloadMeme);
    dom.shareBtn.addEventListener("click", shareMeme);
    dom.userInput.addEventListener("input", updateGenerateButtonState);
    dom.userInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") generateMeme();
    });

    dom.imageUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = await handleImageUpload(file, notify);
        if (url) {
            uploadedImageUrl = url;
            dom.imageThumbnail.src = URL.createObjectURL(file);
            hide(dom.imageUploadContainer);
            show(dom.imageThumbnailContainer);
        }
    });

    dom.removeImageBtn.addEventListener("click", () => {
        uploadedImageUrl = null;
        dom.imageUpload.value = "";
        hide(dom.imageThumbnailContainer);
        show(dom.imageUploadContainer);
    });

    // Konami code easter egg
    document.addEventListener("keydown", (e) => {
        konamiBuffer.push(e.key);
        konamiBuffer = konamiBuffer.slice(-10);
        if (konamiBuffer.join(",") === KONAMI_SEQUENCE) {
            document.body.style.animation = "rainbow 2s";
            notify(
                "🌈 Secret mode activated! You found the easter egg! 🦄",
                "success",
            );
            document.querySelectorAll("h1, h2, h3").forEach((el) => {
                el.textContent = el.textContent.replace(/Cat/g, "😸Cat😸");
            });
            setTimeout(() => {
                document.body.style.animation = "";
            }, 2000);
        }
    });

    updateGenerateButtonState();
}

document.addEventListener("DOMContentLoaded", () => {
    handleAuthRedirect();

    // Read URL params first so model choice isn't overwritten by pickModel
    const { prompt, image, model } = getURLParams();
    if (model) setActiveModel(model);

    updateAuthUI({ skipModelPick: !!model });
    loadUserMemes();
    loadExamples();
    addFloatingEmojis();
    if (image) {
        const safe = sanitizeUrl(image);
        if (safe) {
            uploadedImageUrl = safe;
            dom.imageThumbnail.src = safe;
            hide(dom.imageUploadContainer);
            show(dom.imageThumbnailContainer);
        }
    }
    if (prompt) {
        dom.userInput.value = prompt;
        setTimeout(generateMeme, 500);
    }

    setupEventListeners();

    // Random cat fact after 3s
    setTimeout(() => notify(`Did you know? ${pick(CAT_FACTS)}`), 3000);
});
