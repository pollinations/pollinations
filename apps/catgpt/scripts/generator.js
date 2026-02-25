// Main Meme Generation

import { createCatGPTPrompt, createImageGenerationPrompt } from './promptGenerator.js';
import { generateImageURL, fetchImageWithAuth } from './apiClient.js';
import { dom, setButtonLoading, resetButton, showLoading, hideLoading, showResult } from './ui.js';
import { saveGeneratedMeme } from './storage.js';
import { setURLPrompt, showNotification } from './utilities.js';
import { startCatAnimation, stopCatAnimation, startFakeProgress, stopFakeProgress, celebrate } from './animations.js';
import { handleImageError } from './errorHandler.js';
import { refreshExamples } from './memeLoader.js';
import { uploadedImageUrl } from './imageHandler.js';
import { PROGRESS_MESSAGES } from './config.js';

export async function generateMeme() {
    const userQuestion = dom.userInput.value.trim();
    
    if (!userQuestion) {
        showNotification('Please enter a question for CatGPT! 😸', 'warning');
        return;
    }
    
    setURLPrompt(userQuestion);
    
    setButtonLoading();
    showLoading();
    
    startFakeProgress(PROGRESS_MESSAGES);
    startCatAnimation();
    
    const fullPrompt = createCatGPTPrompt(userQuestion);
    const imagePrompt = createImageGenerationPrompt(userQuestion);
    
    try {
        const imageUrl = generateImageURL(imagePrompt, uploadedImageUrl);
        
        let imageLoadTimeout;
        
        imageLoadTimeout = setTimeout(() => {
            resetButton();
            hideLoading();
            handleImageError('timeout');
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
            console.error('Generation error:', fetchError);
            resetButton();
            hideLoading();
            stopFakeProgress();
            handleImageError('general');
        }
        
    } catch (error) {
        console.error('Error generating meme:', error);
        resetButton();
        hideLoading();
        stopFakeProgress();
        handleImageError('general');
    }
}
