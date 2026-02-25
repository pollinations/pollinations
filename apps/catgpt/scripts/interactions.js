// User Interactions - Download and Share

import { dom } from "./ui.js";
import { showNotification } from "./utilities.js";

export async function downloadMeme() {
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
        showNotification("Download failed! Try right-clicking and save image instead.", "error");
    }
}

export async function shareMeme() {
    if (!dom.generatedMeme.src || dom.generatedMeme.src === "") {
        showNotification("Generate a meme first! 🎨", "warning");
        return;
    }
    
    const currentURL = window.location.href;
    
    try {
        await navigator.clipboard.writeText(currentURL);
        showNotification("Link copied to clipboard! 📋", "success");
    } catch (error) {
        console.error("Error copying to clipboard:", error);
        showNotification("Could not copy link. Try copying it manually! 🔗", "error");
    }
}
