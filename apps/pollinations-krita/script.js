// script.js — UI, state, and generation logic for Krita plugin

import {
    CANVAS_PRESETS,
    clearApiKey,
    extractApiKeyFromFragment,
    generateImageURL,
    getApiKey,
    getAuthorizeUrl,
    pickModel,
    uploadImage,
} from "./ai.js";

// ── DOM ──────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove("hidden");
const hide = (el) => el?.classList.add("hidden");

const dom = {
    authLoggedOut: $("authLoggedOut"),
    authLoggedIn: $("authLoggedIn"),
    authLoginBtn: $("authLoginBtn"),
    authLogoutBtn: $("authLogoutBtn"),
    authBalance: $("authBalance"),
    generatorSection: $("generatorSection"),
    promptInput: $("promptInput"),
    generateBtn: $("generateBtn"),
    modelSelect: $("modelSelect"),
    presetGrid: $("presetGrid"),
    editModeCheckbox: $("editModeCheckbox"),
    uploadContainer: $("uploadContainer"),
    imageUpload: $("imageUpload"),
    imageThumbnailContainer: $("imageThumbnailContainer"),
    imageThumbnail: $("imageThumbnail"),
    removeImageBtn: $("removeImageBtn"),
    resultSection: $("resultSection"),
    generatedImage: $("generatedImage"),
    downloadBtn: $("downloadBtn"),
    newImg2ImgBtn: $("newImg2ImgBtn"),
    generateError: $("generateError"),
};

// ── State ────────────────────────────────────────────────────────────────────

let apiKey = null;
const _activeModel = "auto";
let _activePreset = CANVAS_PRESETS[0];
let uploadedImageUrl = null;
let currentAbort = null;
let generationInterval = null;

// ── Notifications ────────────────────────────────────────────────────────────

function notify(message, _type = "info") {
    const existing = document.querySelector(".krita-notification");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = "krita-notification";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function handleAuthRedirect() {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    // extractApiKeyFromFragment already stores the key in memory
    window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
    );
    notify(
        "Connected! Your Pollen balance will be used for generation.",
        "success",
    );
}

async function updateAuthUI() {
    const loggedOut = dom.authLoggedOut;
    const loggedIn = dom.authLoggedIn;

    dom.authLoginBtn.onclick = () => {
        window.location.href = getAuthorizeUrl(dom.promptInput?.value || "");
    };

    dom.authLogoutBtn.onclick = () => {
        clearApiKey();
        apiKey = null;
        hide(dom.generatorSection);
        show(loggedOut);
        hide(loggedIn);
        notify("Logged out. Log in to use the Krita plugin.");
    };

    apiKey = getApiKey();

    if (!apiKey) {
        show(loggedOut);
        hide(loggedIn);
        hide(dom.generatorSection);
        return;
    }

    hide(loggedOut);
    show(loggedIn);
    show(dom.generatorSection);
    hide(document.querySelector("header .tagline"));

    // Fetch balance
    try {
        const [_profile, balance] = await Promise.all([
            (await import("./ai.js")).fetchProfile(apiKey),
            (await import("./ai.js")).fetchBalance(apiKey),
        ]);
        if (balance) {
            dom.authBalance.textContent = `${balance.balance.toFixed(2)} pollen`;
        }
    } catch {
        clearApiKey();
        apiKey = null;
        notify("Session expired. Please log in again.", "error");
        updateAuthUI();
    }
}

// ── Presets ──────────────────────────────────────────────────────────────────

function renderPresets() {
    dom.presetGrid.innerHTML = "";
    CANVAS_PRESETS.forEach((preset, i) => {
        const btn = document.createElement("button");
        btn.className = `preset-btn${i === 0 ? " active" : ""}`;
        btn.textContent = preset.name;
        btn.onclick = () => {
            document
                .querySelector(".preset-btn.active")
                ?.classList.remove("active");
            btn.classList.add("active");
            _activePreset = preset;
        };
        dom.presetGrid.appendChild(btn);
    });
}

function getActivePreset() {
    const active = dom.presetGrid.querySelector(".preset-btn.active");
    return active
        ? CANVAS_PRESETS[Array.from(dom.presetGrid.children).indexOf(active)]
        : CANVAS_PRESETS[0];
}

// ── Image Upload ─────────────────────────────────────────────────────────────

dom.imageUpload?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadImage(file, notify);
    if (url) {
        uploadedImageUrl = url;
        dom.imageThumbnail.src = url;
        hide(dom.uploadContainer);
        show(dom.imageThumbnailContainer);
    }
});

dom.removeImageBtn?.addEventListener("click", () => {
    uploadedImageUrl = null;
    dom.imageUpload.value = "";
    hide(dom.imageThumbnailContainer);
    show(dom.uploadContainer);
});

// ── Generation ───────────────────────────────────────────────────────────────

function toggleEditMode() {
    if (dom.editModeCheckbox.checked) {
        show(dom.uploadContainer);
    } else {
        dom.editModeCheckbox.checked = false;
        uploadedImageUrl = null;
        hide(dom.uploadContainer);
        hide(dom.imageThumbnailContainer);
    }
}

async function generate() {
    const prompt = dom.promptInput.value.trim();
    if (!prompt) {
        notify("Please enter a prompt!", "error");
        return;
    }
    if (!apiKey) {
        notify("Please log in first!", "error");
        return;
    }

    // If edit mode, require uploaded image
    if (dom.editModeCheckbox.checked && !uploadedImageUrl) {
        notify("Please upload a reference image for editing!", "error");
        return;
    }

    // Reset
    hide(dom.generateError);
    dom.generateError.textContent = "";
    hide(dom.resultSection);
    dom.generateBtn.disabled = true;
    dom.generateBtn.textContent = "Generating... 🎨";

    const preset = getActivePreset();
    const model =
        dom.modelSelect.value === "auto" ? null : dom.modelSelect.value;

    let resolvedModel = model;
    if (!resolvedModel) {
        const picked = await pickModel(apiKey);
        resolvedModel = picked.model;
    }

    const imageUrl = generateImageURL(prompt, resolvedModel, {
        width: preset.width,
        height: preset.height,
        image: uploadedImageUrl || undefined,
    });

    // Track progress messages
    const progressMsgs = [
        "🎨 Generating...",
        "🧠 Thinking about your art...",
        "🖌️ Painting pixels...",
        "✨ Almost done...",
    ];
    let step = 0;
    generationInterval = setInterval(() => {
        dom.generateBtn.textContent = progressMsgs[step % progressMsgs.length];
        step++;
    }, 2500);

    currentAbort = new AbortController();

    try {
        const response = await fetch(imageUrl, { signal: currentAbort.signal });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text.slice(0, 200) || `Error ${response.status}`);
        }

        // The image endpoint returns the image directly (blob)
        const blob = await response.blob();
        const resultUrl = URL.createObjectURL(blob);

        dom.generatedImage.src = resultUrl;
        show(dom.resultSection);
        dom.generateBtn.textContent = "Generate";
        dom.generateBtn.disabled = false;
        clearInterval(generationInterval);

        notify("Image generated! Click Download to save it.", "success");
    } catch (error) {
        clearInterval(generationInterval);
        if (error.name === "AbortError") return;
        console.error("Generation error:", error);
        dom.generateError.textContent =
            error.message || "Failed to generate image.";
        show(dom.generateError);
        dom.generateBtn.textContent = "Generate";
        dom.generateBtn.disabled = false;
        notify("Generation failed. Check the error below.", "error");
    }
}

// ── Download ─────────────────────────────────────────────────────────────────

async function downloadImage() {
    try {
        const blob = await (await fetch(dom.generatedImage.src)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pollinations-krita-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        notify("Image downloaded! 🎉", "success");
    } catch {
        notify(
            "Download failed. Try right-clicking the image and saving.",
            "error",
        );
    }
}

// ── Edit Again (img2img loop) ─────────────────────────────────────────────────

function startImg2Img() {
    dom.editModeCheckbox.checked = true;
    show(dom.uploadContainer);

    // Use the currently generated image as the reference
    fetch(dom.generatedImage.src)
        .then((r) => r.blob())
        .then((blob) => {
            const file = new File([blob], "reference.png", {
                type: "image/png",
            });
            return uploadImage(file, notify);
        })
        .then((url) => {
            if (url) {
                uploadedImageUrl = url;
                dom.imageThumbnail.src = url;
                hide(dom.uploadContainer);
                show(dom.imageThumbnailContainer);
                hide(dom.resultSection);
            }
        })
        .catch(() => notify("Could not set up reference image.", "error"));
}

// ── Init ─────────────────────────────────────────────────────────────────────

function setupEventListeners() {
    dom.generateBtn?.addEventListener("click", generate);
    dom.downloadBtn?.addEventListener("click", downloadImage);
    dom.newImg2ImgBtn?.addEventListener("click", startImg2Img);
    dom.editModeCheckbox?.addEventListener("change", toggleEditMode);
    dom.promptInput?.addEventListener("input", () => {
        dom.generateBtn.disabled = !dom.promptInput.value.trim();
    });
}

document.addEventListener("DOMContentLoaded", () => {
    handleAuthRedirect();
    renderPresets();
    setupEventListeners();
    updateAuthUI();
});
