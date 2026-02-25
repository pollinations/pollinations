import {
    celebrate,
    startCatAnimation,
    startFakeProgress,
    stopCatAnimation,
    stopFakeProgress,
} from "./animations.js";
import { fetchImageWithAuth, generateImageURL } from "./apiClient.js";
import { PROGRESS_MESSAGES } from "./config.js";
import { handleImageError } from "./errorHandler.js";
import { uploadedImageUrl } from "./imageHandler.js";
import { refreshExamples } from "./memeLoader.js";
import { createImageGenerationPrompt } from "./promptGenerator.js";
import { saveGeneratedMeme } from "./storage.js";
import {
    dom,
    hideLoading,
    resetButton,
    setButtonLoading,
    showLoading,
    showResult,
} from "./ui.js";
import { setURLPrompt, showNotification } from "./utilities.js";

export async function generateMeme() {
    const userQuestion = dom.userInput.value.trim();
    
    if (!userQuestion) {
        showNotification("Please enter a question for CatGPT! 😸", "warning");
        return;
    }
    
    setURLPrompt(userQuestion);
    
    setButtonLoading();
    showLoading();
    
    startFakeProgress(PROGRESS_MESSAGES);
    startCatAnimation();
    const imagePrompt = createImageGenerationPrompt(userQuestion);
    
    try {
        const imageUrl = generateImageURL(imagePrompt, uploadedImageUrl);
        
        let imageLoadTimeout;
        
        imageLoadTimeout = setTimeout(() => {
            resetButton();
            hideLoading();
            handleImageError("timeout");
        }, 45000);
        
        try {
            const blobUrl = await fetchImageWithAuth(imageUrl);
            clearTimeout(imageLoadTimeout);
            dom.generatedMeme.src = blobUrl;
            showResult();
            resetButton();
            hideLoading();
            stopCatAnimation();
            stopFakeProgress();
            celebrate();
            saveGeneratedMeme(userQuestion, imageUrl);
            refreshExamples();
        } catch (fetchError) {
            clearTimeout(imageLoadTimeout);
            console.error("Generation error:", fetchError);
            resetButton();
            hideLoading();
            stopFakeProgress();
            handleImageError("general");
        }
        
    } catch (error) {
        console.error("Error generating meme:", error);
        resetButton();
        hideLoading();
        stopFakeProgress();
        handleImageError("general");
    }
}
