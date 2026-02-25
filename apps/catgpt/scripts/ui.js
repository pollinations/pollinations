// UI DOM Elements Management

export const dom = {
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

export function setButtonLoading() {
    dom.generateBtn.disabled = true;
    dom.generateBtn.innerHTML = "🐾 Generating... (~30s)";
    dom.generateBtn.style.opacity = "0.6";
    dom.generateBtn.style.cursor = "not-allowed";
}

export function resetButton() {
    dom.generateBtn.disabled = false;
    dom.generateBtn.innerHTML = "Generate CatGPT Meme 🎨";
    dom.generateBtn.style.opacity = "1";
    dom.generateBtn.style.cursor = "pointer";
}

export function showLoading() {
    dom.loadingIndicator.classList.remove("hidden");
    dom.resultSection.classList.add("hidden");
}

export function hideLoading() {
    dom.loadingIndicator.classList.add("hidden");
}

export function showResult() {
    dom.resultSection.classList.remove("hidden");
    dom.resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function showImageThumbnail() {
    dom.imageUploadContainer.classList.add("hidden");
    dom.imageThumbnailContainer.classList.remove("hidden");
}

export function hideImageThumbnail() {
    dom.imageThumbnailContainer.classList.add("hidden");
    dom.imageUploadContainer.classList.remove("hidden");
}
