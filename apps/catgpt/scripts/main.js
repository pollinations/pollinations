// Main Application Entry Point

import { addAnimationStyles, addFloatingEmojis } from "./animations.js";
import { CAT_FACTS, KONAMI_SEQUENCE } from "./config.js";
import { generateMeme } from "./generator.js";
import {
    clearUploadedImageUrl,
    handleImageUpload,
    setUploadedImageUrl,
} from "./imageHandler.js";
import { downloadMeme, shareMeme } from "./interactions.js";
import { loadExamples, loadUserMemes } from "./memeLoader.js";
import { cleanupOldMemes, getSavedMemes } from "./storage.js";
import { dom, hideImageThumbnail, showImageThumbnail } from "./ui.js";
import { getRandomItem, getURLPrompt, showNotification } from "./utilities.js";

let konamiCode = [];

export function initializeApp() {
    // Setup animations and styles
    addAnimationStyles();

    // Initialize data
    cleanupOldMemes(getSavedMemes());
    loadUserMemes();
    loadExamples();
    loadRandomCatFact();
    handleURLPrompt();

    // Setup event listeners
    setupEventListeners();
    addFloatingEmojis();
}

function setupEventListeners() {
    // Main buttons
    dom.generateBtn.addEventListener("click", generateMeme);
    dom.downloadBtn.addEventListener("click", downloadMeme);
    dom.shareBtn.addEventListener("click", shareMeme);

    // Image upload
    dom.imageUpload.addEventListener("change", handleImageUploadEvent);
    dom.removeImageBtn.addEventListener("click", handleRemoveImage);

    // Text input
    dom.userInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            generateMeme();
        }
    });

    // Easter egg
    document.addEventListener("keydown", handleKonamiCode);
}

async function handleImageUploadEvent(e) {
    const file = e.target.files[0];
    if (file) {
        const url = await handleImageUpload(file);
        if (url) {
            setUploadedImageUrl(url);
            dom.imageThumbnail.src = URL.createObjectURL(file);
            showImageThumbnail();
        }
    }
}

function handleRemoveImage() {
    clearUploadedImageUrl();
    dom.imageUpload.value = "";
    hideImageThumbnail();
}

function handleURLPrompt() {
    const urlPrompt = getURLPrompt();
    if (urlPrompt) {
        dom.userInput.value = urlPrompt;
        setTimeout(() => {
            generateMeme();
        }, 500);
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

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializeApp);
