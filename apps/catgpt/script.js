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
    isLoggedIn,
    storeApiKey,
} from "./ai.js";

// ── UI Constants ────────────────────────────────────────────────────────────

const CAT_FACTS = [
    "Cats spend 70% of their lives sleeping 😴",
    "A group of cats is called a 'clowder' 🐱🐱🐱",
    "Cats have over 20 vocalizations 🎵",
    "The first cat in space was French 🚀",
    "Cats can rotate their ears 180 degrees 👂",
];

const KONAMI_SEQUENCE = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
];

const ANIMATION_CONFIG = {
    LOADING_CATS: [
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
    ],
    RETRY_CATS: ["😾", "😿", "🙄", "😤", "😑", "😒", "😔", "🐱‍👤", "😸", "😼"],
    FLOATING_EMOJIS: ["🐱", "💭", "✨", "🌟", "😸", "🐾", "💜", "🎨"],
    CELEBRATION_EMOJIS: ["🎉", "✨", "🌟", "💫", "🎊"],
    CELEBRATION_COLORS: ["#ff61d8", "#05ffa1", "#ffcc00"],
};

const ERROR_MESSAGES = [
    "😾 *yawns* The art studio is full of sleeping cats... try again in 30 seconds!",
    "🐱 *stretches paws* Too many humans asking questions! I need a catnap... wait 30 seconds, please.",
    "😸 *knocks over coffee* Oops! The meme machine broke. Give me 30 seconds to fix it with my paws.",
    "🙄 *rolls eyes* Seriously? Another request? The queue is fuller than my food bowl... try in 30 seconds.",
    "😴 *curls up* All the AI cats are napping right now. Check back in 30 seconds, human.",
    "🐾 *walks across keyboard* Purrfect timing... NOT. The servers are as full as a litter box. 30 seconds!",
    "😼 *flicks tail dismissively* The internet tubes are clogged with cat hair. Try again in 30 seconds.",
    "🎨 *knocks over paint* My artistic genius is in high demand! Wait your turn... 30 seconds, human.",
];

const PROGRESS_MESSAGES = [
    "🧠 Waking up CatGPT... (this cat is sleepy)",
    "☕ Brewing digital coffee for maximum sass...",
    "🎨 Sketching with chaotic energy...",
    "😼 Teaching AI the art of being unimpressed...",
    "📝 Writing sarcastic responses in Comic Sans...",
    "🌙 Channeling midnight cat energy...",
    "✨ Sprinkling some magic dust...",
    "🎯 Perfecting the level of 'couldn't care less'...",
    "🔥 Making it fire (but like, ironically)...",
    "🎭 Adding just the right amount of drama...",
    "💅 Polishing those aloof vibes...",
    "🚀 Almost done! (CatGPT doesn't rush for anyone)",
];

// ── Utilities ───────────────────────────────────────────────────────────────

function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return { prompt: params.get("prompt"), image: params.get("image") };
}

function setURLPrompt(prompt) {
    const url = new URL(window.location);
    if (prompt) {
        url.searchParams.set("prompt", prompt);
        if (uploadedImageUrl) {
            url.searchParams.set("image", uploadedImageUrl);
        } else {
            url.searchParams.delete("image");
        }
    } else {
        url.searchParams.delete("prompt");
        url.searchParams.delete("image");
    }
    window.history.replaceState({}, "", url);
}

const NOTIFICATION_COLORS = {
    success: "#A8E6A2",
    error: "#C9A9E4",
    info: "#E8F372",
    warning: "#E8F372",
};

function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        max-width: 280px;
        padding: 0.6rem 1rem;
        background: ${NOTIFICATION_COLORS[type] || NOTIFICATION_COLORS.info}cc;
        backdrop-filter: blur(8px);
        color: #000;
        border-radius: 10px;
        font-size: 0.85rem;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── DOM Elements ────────────────────────────────────────────────────────────

const dom = {
    userInput: document.getElementById("userInput"),
    generateBtn: document.getElementById("generateBtn"),
    loadingIndicator: document.getElementById("loadingIndicator"),
    resultSection: document.getElementById("resultSection"),
    generatedMeme: document.getElementById("generatedMeme"),
    downloadBtn: document.getElementById("downloadBtn"),
    shareBtn: document.getElementById("shareBtn"),
    examplesGrid: document.getElementById("examplesGrid"),
    yourMemesGrid: document.getElementById("yourMemesGrid"),
    imageUpload: document.getElementById("imageUpload"),
    imageUploadContainer: document.getElementById("imageUploadContainer"),
    imageThumbnailContainer: document.getElementById("imageThumbnailContainer"),
    imageThumbnail: document.getElementById("imageThumbnail"),
    removeImageBtn: document.getElementById("removeImageBtn"),
};

let currentGenerationAbort = null;
let retryCountdownInterval = null;

function setButtonLoading() {
    dom.generateBtn.classList.add("generating");
    dom.generateBtn.textContent = "Generating... Cancel?";
    dom.generateBtn.disabled = false;
}

function resetButton() {
    clearRetryCountdown();
    dom.generateBtn.classList.remove("generating", "retrying");
    dom.generateBtn.textContent = "Generate Meme";
    dom.generateBtn.disabled = false;
    currentGenerationAbort = null;
}

function setButtonRetry(seconds) {
    dom.generateBtn.classList.remove("generating");
    dom.generateBtn.classList.add("retrying");
    dom.generateBtn.disabled = false;
    let remaining = seconds;
    dom.generateBtn.textContent = `Retrying in ${remaining}s... Cancel?`;
    retryCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearRetryCountdown();
            generateMeme();
        } else {
            dom.generateBtn.textContent = `Retrying in ${remaining}s... Cancel?`;
        }
    }, 1000);
}

function clearRetryCountdown() {
    if (retryCountdownInterval) {
        clearInterval(retryCountdownInterval);
        retryCountdownInterval = null;
    }
}

function showLoading() {
    dom.loadingIndicator.classList.remove("hidden");
    dom.resultSection.classList.add("hidden");
}

function hideLoading() {
    dom.loadingIndicator.classList.add("hidden");
}

function showResult() {
    dom.resultSection.classList.remove("hidden");
    dom.resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showImageThumbnail() {
    dom.imageUploadContainer.classList.add("hidden");
    dom.imageThumbnailContainer.classList.remove("hidden");
}

function hideImageThumbnail() {
    dom.imageThumbnailContainer.classList.add("hidden");
    dom.imageUploadContainer.classList.remove("hidden");
}

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "catgpt-generated";

function saveGeneratedMeme(prompt, url) {
    const saved = getSavedMemes();
    const updated = [
        { prompt, url },
        ...saved.filter((m) => m.prompt !== prompt),
    ].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

function getSavedMemes() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
}

// ── Animations ──────────────────────────────────────────────────────────────

let catAnimationInterval;
let progressInterval;
let progressStep = 0;

function startCatAnimation(mode = "loading") {
    const catEmojis =
        mode === "retry"
            ? ANIMATION_CONFIG.RETRY_CATS
            : ANIMATION_CONFIG.LOADING_CATS;
    const speed = mode === "retry" ? 800 : 400;

    catAnimationInterval = setInterval(() => {
        const cat = document.createElement("div");
        cat.style.cssText = `
            position: fixed;
            font-size: ${2 + Math.random() * 2}rem;
            z-index: 999;
            pointer-events: none;
            top: ${Math.random() * 100}vh;
            left: -100px;
            animation: catSlide ${3 + Math.random() * 2}s linear forwards;
        `;
        cat.textContent = getRandomItem(catEmojis);
        document.body.appendChild(cat);
        setTimeout(() => {
            if (cat.parentNode) cat.remove();
        }, 6000);
    }, speed);
}

function stopCatAnimation() {
    if (catAnimationInterval) {
        clearInterval(catAnimationInterval);
        catAnimationInterval = null;
    }
    for (const cat of document.querySelectorAll("[style*='catSlide']")) {
        cat.remove();
    }
}

function startFakeProgress() {
    progressStep = 1;
    const progressText = document.createElement("div");
    progressText.id = "progress-text";
    progressText.textContent = PROGRESS_MESSAGES[0];
    progressText.style.cssText = `
        text-align: center;
        font-size: 0.9rem;
        color: var(--color-primary);
        margin-top: 1rem;
        font-weight: 500;
        animation: pulse 2s infinite;
    `;
    dom.loadingIndicator.appendChild(progressText);

    progressInterval = setInterval(() => {
        if (progressStep < PROGRESS_MESSAGES.length) {
            progressText.textContent = PROGRESS_MESSAGES[progressStep];
            progressStep++;
        } else {
            progressText.textContent = "🎨 Finalizing your masterpiece...";
        }
    }, 2500);
}

function stopFakeProgress() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    const progressText = document.getElementById("progress-text");
    if (progressText) progressText.remove();
}

function celebrate() {
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const emoji = document.createElement("div");
            emoji.textContent = getRandomItem(
                ANIMATION_CONFIG.CELEBRATION_EMOJIS,
            );
            emoji.style.cssText = `
                position: fixed;
                left: ${Math.random() * 100}%;
                top: -50px;
                font-size: ${20 + Math.random() * 20}px;
                color: ${getRandomItem(ANIMATION_CONFIG.CELEBRATION_COLORS)};
                animation: fall ${2 + Math.random() * 2}s ease-in forwards;
                z-index: 999;
                pointer-events: none;
            `;
            document.body.appendChild(emoji);
            setTimeout(() => emoji.remove(), 4000);
        }, i * 100);
    }
}

function addFloatingEmojis() {
    const container = document.querySelector(".container");
    ANIMATION_CONFIG.FLOATING_EMOJIS.forEach((emoji, index) => {
        const floater = document.createElement("div");
        floater.textContent = emoji;
        floater.className = "floating-emoji";
        floater.style.cssText = `
            position: absolute;
            font-size: 2rem;
            opacity: 0.25;
            animation: float ${10 + index * 2}s infinite ease-in-out;
            animation-delay: ${index * 2}s;
            pointer-events: none;
            z-index: -1;
        `;
        container.appendChild(floater);
    });
}

// ── Image Upload State ──────────────────────────────────────────────────────

let uploadedImageUrl = null;

// ── Cards ───────────────────────────────────────────────────────────────────

function sanitizeImageUrl(url) {
    if (!url || typeof url !== "string") return null;
    try {
        const parsed = new URL(url, window.location.href);
        const allowedProtocols = ["http:", "https:", "blob:", "data:"];
        if (!allowedProtocols.includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function createMemeCard(prompt, index, imageUrl) {
    const safeUrl = sanitizeImageUrl(imageUrl);
    if (!safeUrl) {
        console.warn(`Invalid or missing URL for: "${prompt}"`);
        return null;
    }

    const card = document.createElement("div");
    card.className = "example-card";
    card.style.animationDelay = `${index * 0.1}s`;


    const img = document.createElement("img");
    img.src = safeUrl;
    img.alt = prompt;
    img.loading = "lazy";
    card.appendChild(img);

    const promptText = document.createElement("p");
    promptText.textContent = `"${prompt}"`;
    card.appendChild(promptText);

    card.addEventListener("click", () => {
        dom.userInput.value = prompt;
        dom.userInput.scrollIntoView({ behavior: "smooth", block: "center" });
        dom.userInput.focus();
        dom.userInput.style.animation = "pulse 0.5s";
        setTimeout(() => {
            dom.userInput.style.animation = "";
        }, 500);
        showNotification("Prompt loaded! Hit Generate 🎨", "info");
    });

    return card;
}

// ── Meme Loading ────────────────────────────────────────────────────────────

function loadUserMemes() {
    dom.yourMemesGrid.innerHTML = "";
    const savedMemes = getSavedMemes();

    if (savedMemes.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent =
            "No memes yet! Generate one to see it here. 🎨";
        emptyMessage.style.cssText = `
            grid-column: 1 / -1;
            text-align: center;
            color: var(--color-cream);
            padding: 2rem;
            font-style: italic;
        `;
        dom.yourMemesGrid.appendChild(emptyMessage);
        return;
    }

    savedMemes.forEach((meme, index) => {
        const card = createMemeCard(meme.prompt, index, meme.url, true);
        if (card) dom.yourMemesGrid.appendChild(card);
    });
}

function loadExamples() {
    dom.examplesGrid.innerHTML = "";
    EXAMPLE_PROMPTS.forEach((question, index) => {
        const prompt = createImageGenerationPrompt(question);
        const url = generateImageURL(prompt);
        const card = createMemeCard(question, index, url);
        if (card) dom.examplesGrid.appendChild(card);
    });
}

// ── Error Handling ──────────────────────────────────────────────────────────

function handleImageError(errorType = "general") {
    const randomMessage = getRandomItem(ERROR_MESSAGES);
    const message =
        errorType === "timeout"
            ? `⏰ Too long... ${randomMessage}`
            : randomMessage;
    showNotification(message, "error");
    stopCatAnimation();
    hideLoading();
    stopFakeProgress();
    setButtonRetry(10);
}

// ── Generator ───────────────────────────────────────────────────────────────

async function generateMeme() {
    // If currently generating or retrying, cancel
    if (dom.generateBtn.classList.contains("generating") || dom.generateBtn.classList.contains("retrying")) {
        if (currentGenerationAbort) currentGenerationAbort();
        resetButton();
        hideLoading();
        stopFakeProgress();
        stopCatAnimation();
        showNotification("Generation cancelled.", "info");
        return;
    }

    const userQuestion = dom.userInput.value.trim();

    if (!userQuestion) {
        showNotification("Please enter a question for CatGPT! 😸", "warning");
        return;
    }

    setURLPrompt(userQuestion);
    setButtonLoading();
    showLoading();
    startFakeProgress();
    startCatAnimation();

    const imagePrompt = createImageGenerationPrompt(
        userQuestion,
        !!uploadedImageUrl,
    );
    const imageUrl = generateImageURL(imagePrompt, uploadedImageUrl);
    let cancelled = false;
    let timedOut = false;

    currentGenerationAbort = () => { cancelled = true; };

    const imageLoadTimeout = setTimeout(() => {
        if (cancelled) return;
        timedOut = true;
        handleImageError("timeout");
    }, 45000);

    try {
        await new Promise((resolve, reject) => {
            const img = dom.generatedMeme;
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
        });
        clearTimeout(imageLoadTimeout);
        if (cancelled) return;
        resetButton();
        hideLoading();
        stopFakeProgress();
        showResult();
        stopCatAnimation();
        celebrate();
        saveGeneratedMeme(userQuestion, imageUrl);
        loadUserMemes();
    } catch (error) {
        clearTimeout(imageLoadTimeout);
        if (cancelled) return;
        console.error("Generation error:", error);
        if (!timedOut) {
            handleImageError("general");
        }
    }
}

// ── Interactions ────────────────────────────────────────────────────────────

async function downloadMeme() {
    try {
        const response = await fetch(dom.generatedMeme.src);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `catgpt-meme-${Date.now()}.png`;
        link.click();
        window.URL.revokeObjectURL(url);
        showNotification("Meme downloaded! 🎉", "success");
    } catch (error) {
        console.error("Download failed:", error);
        showNotification(
            "Download failed! Try right-clicking and save image instead.",
            "error",
        );
    }
}

async function shareMeme() {
    if (!dom.generatedMeme.src) {
        showNotification("Generate a meme first! 🎨", "warning");
        return;
    }
    const currentURL = window.location.href;
    try {
        await navigator.clipboard.writeText(currentURL);
        showNotification("Link copied to clipboard! 📋", "success");
    } catch (error) {
        console.error("Error copying to clipboard:", error);
        showNotification(
            "Could not copy link. Try copying it manually! 🔗",
            "error",
        );
    }
}

// ── Main Init ───────────────────────────────────────────────────────────────

let konamiCode = [];

function initializeApp() {
    handleAuthRedirect();
    updateAuthUI();
    loadUserMemes();
    loadExamples();
    loadRandomCatFact();
    handleURLPrompt();
    setupEventListeners();
    addFloatingEmojis();
}

// ── BYOP Auth ──────────────────────────────────────────────────────────────

function handleAuthRedirect() {
    const key = extractApiKeyFromFragment();
    if (key) {
        storeApiKey(key);
        // Clean URL fragment
        window.history.replaceState(
            {},
            "",
            window.location.pathname + window.location.search,
        );
        showNotification(
            "Logged in! Using your Pollen balance now.",
            "success",
        );
    }
}

const TIER_EMOJIS = { seed: "🌱", flower: "🌸", nectar: "🍯" };

function maskApiKey(key) {
    if (!key || key.length < 6) return "••••••••";
    return key.substring(0, 4) + "••••••••";
}

async function updateAuthUI() {
    const loggedOutEl = document.getElementById("authLoggedOut");
    const loggedInEl = document.getElementById("authLoggedIn");
    const loginBtn = document.getElementById("authLoginBtn");
    const logoutBtn = document.getElementById("authLogoutBtn");

    if (!loggedOutEl || !loggedInEl) return;

    loginBtn.onclick = () => {
        window.location.href = getAuthorizeUrl();
    };

    logoutBtn.onclick = () => {
        clearApiKey();
        updateAuthUI();
        showNotification("Logged out. Using free tier now.", "info");
    };

    if (!isLoggedIn()) {
        loggedOutEl.classList.remove("hidden");
        loggedInEl.classList.add("hidden");
        return;
    }

    loggedOutEl.classList.add("hidden");
    loggedInEl.classList.remove("hidden");

    const apiKey = getStoredApiKey();

    // Show masked API key immediately
    document.getElementById("authApiKey").textContent = maskApiKey(apiKey);

    // Fetch profile and balance in parallel
    try {
        const [profile, balance] = await Promise.all([
            fetchProfile(apiKey).catch(() => null),
            fetchBalance(apiKey).catch(() => null),
        ]);

        if (profile) {
            const name = profile.githubUsername || profile.name || "User";
            document.getElementById("authUserName").textContent = name;
            document.getElementById("authUserEmail").textContent = profile.email || "";

            const avatarImg = document.getElementById("authAvatar");
            const avatarFallback = document.getElementById("authAvatarFallback");
            if (profile.image) {
                avatarImg.src = profile.image;
                avatarImg.classList.remove("hidden");
                avatarFallback.classList.add("hidden");
            } else {
                avatarImg.classList.add("hidden");
                avatarFallback.classList.remove("hidden");
                avatarFallback.textContent = name.charAt(0).toUpperCase();
            }

            if (profile.tier && TIER_EMOJIS[profile.tier]) {
                document.getElementById("authTier").textContent =
                    `${TIER_EMOJIS[profile.tier]} ${profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)}`;
            } else {
                document.getElementById("authTier").textContent = "Free";
            }
        }

        if (balance) {
            document.getElementById("authBalance").textContent =
                `${balance.balance.toFixed(2)} pollen`;
        }
    } catch (err) {
        console.error("Failed to load account info:", err);
        // If 401, the key is invalid — log out
        clearApiKey();
        updateAuthUI();
        showNotification("Session expired. Please log in again.", "warning");
    }
}

function setupEventListeners() {
    dom.generateBtn.addEventListener("click", generateMeme);
    dom.downloadBtn.addEventListener("click", downloadMeme);
    dom.shareBtn.addEventListener("click", shareMeme);

    document.getElementById("imageUploadBtn").addEventListener("click", () => {
        dom.imageUpload.click();
    });

    dom.imageUpload.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await handleImageUpload(file, showNotification);
            if (url) {
                uploadedImageUrl = url;
                dom.imageThumbnail.src = URL.createObjectURL(file);
                showImageThumbnail();
            }
        }
    });

    dom.removeImageBtn.addEventListener("click", () => {
        uploadedImageUrl = null;
        dom.imageUpload.value = "";
        hideImageThumbnail();
    });

    dom.userInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") generateMeme();
    });

    document.addEventListener("keydown", handleKonamiCode);
}

function handleURLPrompt() {
    const { prompt, image } = getURLParams();

    if (image) {
        const safeImage = sanitizeImageUrl(image);
        if (safeImage) {
            uploadedImageUrl = safeImage;
            dom.imageThumbnail.src = safeImage;
            showImageThumbnail();
        }
    }

    if (prompt) {
        dom.userInput.value = prompt;
        setTimeout(generateMeme, 500);
    }
}

function handleKonamiCode(e) {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);

    if (konamiCode.join(",") === KONAMI_SEQUENCE.join(",")) {
        document.body.style.animation = "rainbow 2s";
        showNotification(
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
}

function loadRandomCatFact() {
    setTimeout(() => {
        const randomFact = getRandomItem(CAT_FACTS);
        showNotification(`Did you know? ${randomFact}`, "info");
    }, 3000);
}

document.addEventListener("DOMContentLoaded", initializeApp);
