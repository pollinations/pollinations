// Image Upload and Processing

import { API_CONFIG } from "./config.js";
import { showNotification } from "./utilities.js";

export let uploadedImageUrl = null;

export function fileToDataURI(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", API_CONFIG.CLOUDINARY_UPLOAD_PRESET);
    
    if (API_CONFIG.CLOUDINARY_API_KEY) {
        formData.append("api_key", API_CONFIG.CLOUDINARY_API_KEY);
    }
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${API_CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`,
            {
                method: "POST",
                body: formData
            }
        );
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Cloudinary error:", errorData);
            throw new Error(`Upload failed: ${errorData.error?.message || "Unknown error"}`);
        }
        
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload failed:", error);
        throw error;
    }
}

export async function handleImageUpload(file) {
    if (!file) {
        return null;
    }
    
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification(
            "Image too large! Please use an image under 5MB.",
            "error",
        );
        return null;
    }
    
    try {
        showNotification("Uploading image...", "info");
        return await uploadToCloudinary(file);
    } catch (error) {
        console.error("Cloudinary upload failed:", error);
        showNotification("Cloud upload failed. Trying local method...", "warning");
        
        try {
            const dataUri = await fileToDataURI(file);
            
            if (dataUri.length > 500000) {
                showNotification("Image may be too large for reliable use. Results might vary.", "warning");
            }
            
            return dataUri;
        } catch (fallbackError) {
            showNotification("Could not process image. Please try a smaller image.", "error");
            console.error("Base64 fallback failed:", fallbackError);
            return null;
        }
    }
}

export function setUploadedImageUrl(url) {
    uploadedImageUrl = url;
}

export function clearUploadedImageUrl() {
    uploadedImageUrl = null;
}
