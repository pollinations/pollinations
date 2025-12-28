// ai.js - AI-related functionality for CatGPT

// Constants for AI image generation
const POLLINATIONS_API = 'https://image.pollinations.ai/prompt';
const ORIGINAL_CATGPT_IMAGE = 'https://raw.githubusercontent.com/pollinations/catgpt/refs/heads/main/images/original-catgpt.png';

// Cloudinary Configuration (Free unsigned upload)
const CLOUDINARY_CLOUD_NAME = 'pollinations'; // Your cloud name
const CLOUDINARY_UPLOAD_PRESET = 'pollinations-image'; // Your unsigned preset
const CLOUDINARY_API_KEY = '939386723511927'; // Cloudinary public API key

/**
 * Creates the CatGPT prompt for image generation
 * @param {string} userQuestion - The user's question
 * @param {boolean} hasImage - Whether a custom image is being used
 * @returns {string} The complete prompt for AI image generation
 */
function createCatGPTPrompt(userQuestion, hasImage = false) {
    const description = hasImage ? 
        'replace the person on the left with the person in the second image, incorporate visible elements or landmarks from the second image, caricature,' : 
        'black bob hair, brick/burgundy sweater';
    
    return `Single-panel CatGPT webcomic on white background. Thick uneven black marker strokes, intentionally sketchy. Human with dot eyes, ${description} (#8b4035). White cat with black patches sitting upright, half-closed eyes. Hand-written wobbly text, "CATGPT" title in rounded rectangle. @missfitcomics signature. 95% black-and-white, no shading.

---

You are **CatGPT** – an aloof, self-important house-cat oracle.

Guidelines
•  Replies: one or two crisp sentences, no filler.  
•  Tone: detached, sardonic, subtly superior.  
•  Cats outrank humans; human problems = minor curiosities.  
•  When self-referential, be unpredictable and natural.
•  Offer a curt "solution" or dismissal, then redirect to feline perspective.  
•  Never apologise or over-explain; indifference is charm.

---

Human asks: "${userQuestion}"
CatGPT:`;
}

/**
 * Generates the complete image URL for the Pollinations API
 * @param {string} prompt - The AI prompt
 * @param {string|null} uploadedImageUrl - Optional custom image URL
 * @returns {string} The complete image generation URL
 */
function generateImageURL(prompt, uploadedImageUrl = null) {
    // If user uploaded an image, append it with a comma to the original image
    // This allows using both the original style and the user's custom image
    let imageParam;
    if (uploadedImageUrl) {
        // Join URLs with comma first, then encode the entire string
        // This ensures the comma is properly encoded as %2C
        imageParam = encodeURIComponent(`${ORIGINAL_CATGPT_IMAGE},${uploadedImageUrl}`);
    } else {
        imageParam = encodeURIComponent(ORIGINAL_CATGPT_IMAGE);
    }
    return `${POLLINATIONS_API}/${encodeURIComponent(prompt)}?model=nanobanana&image=${imageParam}&referrer=pollinations.github.io&quality=high`;
}

/**
 * Convert file to base64 data URI (fallback for small images)
 * @param {File} file - The file to convert
 * @returns {Promise<string>} Promise that resolves to the data URI
 */
function fileToDataURI(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Upload image to Cloudinary
 * @param {File} file - The file to upload
 * @returns {Promise<string>} Promise that resolves to the uploaded image URL
 */
async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    // Add API key if available
    if (CLOUDINARY_API_KEY) {
        formData.append('api_key', CLOUDINARY_API_KEY);
    }
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Cloudinary error:', errorData);
            throw new Error(`Upload failed: ${errorData.error?.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Cloudinary upload failed:', error);
        throw error;
    }
}

/**
 * Handle image upload with fallback strategies
 * @param {File} file - The file to upload
 * @param {Function} showNotification - Notification callback function
 * @returns {Promise<string|null>} Promise that resolves to the image URL or null
 */
async function handleImageUpload(file, showNotification) {
    if (!file) {
        return null;
    }
    
    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showNotification('Image too large! Please use an image under 5MB.', 'error');
        return null;
    }
    
    try {
        // Try Cloudinary upload first (now using Pollinations account)
        showNotification('Uploading image to Cloudinary...', 'info');
        return await uploadToCloudinary(file);
    } catch (error) {
        console.error('Cloudinary upload failed:', error);
        showNotification('Cloud upload failed. Trying local method...', 'warning');
        
        // Fallback to base64 if upload fails
        try {
            const dataUri = await fileToDataURI(file);
            
            // Warn if the data URI is too large (might cause issues with some browsers)
            if (dataUri.length > 500000) { // ~500KB as base64 is larger than binary
                showNotification('Image may be too large for reliable use. Results might vary.', 'warning');
            }
            
            return dataUri;
        } catch (fallbackError) {
            showNotification('Could not process image. Please try a smaller image.', 'error');
            console.error('Base64 fallback failed:', fallbackError);
            return null;
        }
    }
}

/**
 * Generate a complete CatGPT meme
 * @param {string} userQuestion - The user's question
 * @param {string|null} uploadedImageUrl - Optional custom image URL
 * @returns {Object} Object containing the prompt and image URL
 */
function generateCatGPTMeme(userQuestion, uploadedImageUrl = null) {
    const fullPrompt = createCatGPTPrompt(userQuestion, !!uploadedImageUrl);
    const imageUrl = generateImageURL(fullPrompt, uploadedImageUrl);
    
    return {
        prompt: fullPrompt,
        imageUrl: imageUrl,
        userQuestion: userQuestion,
        hasCustomImage: !!uploadedImageUrl
    };
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        createCatGPTPrompt,
        generateImageURL,
        fileToDataURI,
        uploadToCloudinary,
        handleImageUpload,
        generateCatGPTMeme,
        POLLINATIONS_API,
        ORIGINAL_CATGPT_IMAGE,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        CLOUDINARY_API_KEY
    };
} else {
    // Browser environment - functions are already in global scope
    window.CatGPTAI = {
        createCatGPTPrompt,
        generateImageURL,
        fileToDataURI,
        uploadToCloudinary,
        handleImageUpload,
        generateCatGPTMeme,
        POLLINATIONS_API,
        ORIGINAL_CATGPT_IMAGE,
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        CLOUDINARY_API_KEY
    };
}
