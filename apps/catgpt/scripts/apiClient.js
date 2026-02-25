import { API_CONFIG } from "./config.js";

const CATGPT_STYLE = "Single-panel CatGPT webcomic on white background. Thick uneven black marker strokes, intentionally sketchy. Human with dot eyes, black bob hair, brick/burgundy sweater (#8b4035). White cat with black patches sitting upright, half-closed eyes. Hand-written wobbly text, \"CATGPT\" title in rounded rectangle. @missfitcomics signature. 95% black-and-white, no shading.";

const CATGPT_PERSONALITY = `You are **CatGPT** – an aloof, self-important house-cat oracle.

Guidelines
•  Replies: one or two crisp sentences, no filler.  
•  Tone: detached, sardonic, subtly superior.  
•  Cats outrank humans; human problems = minor curiosities.  
•  When self-referential, be unpredictable and natural.
•  Offer a curt "solution" or dismissal, then redirect to feline perspective.  
•  Never apologise or over-explain; indifference is charm.`;

export function createCatGPTPrompt(userQuestion) {
    return `${CATGPT_STYLE}

---

${CATGPT_PERSONALITY}

---

Human asks: "${userQuestion}"
CatGPT:`;
}

export function createImageGenerationPrompt(userQuestion) {
    return `Single-panel CatGPT webcomic, white background, thick black marker strokes. White cat with black patches, human with bob hair. Handwritten text.

IMPORTANT: CatGPT's response MUST be 2-5 words ONLY. Make it funny, sarcastic, and dismissive. Examples: "Not your problem.", "I"d rather nap.", "Hard pass, human."

Human asks: "${userQuestion}"
CatGPT responds (2-5 words, funny):`;
}

export function generateImageURL(prompt, uploadedImageUrl = null) {
    let imageParam;
    if (uploadedImageUrl) {
        imageParam = encodeURIComponent(
            `${API_CONFIG.ORIGINAL_CATGPT_IMAGE},${uploadedImageUrl}`,
        );
    } else {
        imageParam = encodeURIComponent(API_CONFIG.ORIGINAL_CATGPT_IMAGE);
    }
    return `${API_CONFIG.POLLINATIONS_API}/${encodeURIComponent(prompt)}?height=1024&width=1024&model=gptimage&enhance=true&quality=high&image=${imageParam}`;
}

export async function fetchImageWithAuth(imageUrl) {
    const response = await fetch(imageUrl, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${API_CONFIG.POLLINATIONS_API_KEY}`
        },
    });

    if (!response.ok) {
        let errorDetails = "";
        try {
            const responseText = await response.text();

            try {
                const errorData = JSON.parse(responseText);
                errorDetails =
                    errorData.error?.message || JSON.stringify(errorData);
            } catch {
                errorDetails = responseText || `HTTP ${response.status}`;
            }
        } catch {
            errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        }

        console.error("API Error Details:", {
            status: response.status,
            statusText: response.statusText,
            details: errorDetails,
            url: imageUrl,
        });

        throw new Error(`API_ERROR_${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}
