import debug from "debug";
import sharp from "sharp";

const log = debug("pollinations:safety");
const logError = debug("pollinations:safety:error");

const SAFETY_API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const SAFETY_MODEL = "gemini-fast";
const SAFETY_TIMEOUT_MS = 10000;
const SAFETY_TOKEN = process.env.PLN_NSFW_TOKEN;

// Downscale images to save tokens - 256px is enough for NSFW detection
const SAFETY_IMAGE_SIZE = 256;
// Max image size to download (100MB) - supports 4K images (4096x4096)
const MAX_IMAGE_SIZE_BYTES = 100 * 1024 * 1024;
// Timeout for image download
const IMAGE_DOWNLOAD_TIMEOUT_MS = 5000;

export type SafetyCheckResult = {
    safe: boolean;
    reason?: string;
};

/**
 * Checks if content (prompt + optional images) is safe for generation.
 * Uses gemini-fast model for context-aware multimodal classification.
 *
 * @param prompt - The text prompt to check
 * @param imageUrls - Optional array of image URLs to check
 * @returns SafetyCheckResult with safe boolean and optional reason
 */
export async function checkContentSafety(
    prompt: string,
    imageUrls: string[] = [],
): Promise<SafetyCheckResult> {
    try {
        if (!SAFETY_TOKEN) {
            logError("PLN_NSFW_TOKEN not configured - blocking request (fail-closed)");
            return { safe: false, reason: "Safety check unavailable" };
        }

        // Build message content with downloaded/resized images (parallel)
        const content = await buildMessageContent(prompt, imageUrls);

        const response = await fetch(SAFETY_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SAFETY_TOKEN}`,
            },
            body: JSON.stringify({
                model: SAFETY_MODEL,
                messages: [
                    {
                        role: "system",
                        content: SAFETY_SYSTEM_PROMPT,
                    },
                    {
                        role: "user",
                        content,
                    },
                ],
                max_tokens: 5,
                temperature: 0,
            }),
            signal: AbortSignal.timeout(SAFETY_TIMEOUT_MS),
        });

        if (!response.ok) {
            logError("Safety API error:", response.status, response.statusText);
            // Fail closed on API errors - safety first
            return { safe: false, reason: "Safety check failed" };
        }

        let data: unknown;
        try {
            data = await response.json();
        } catch (parseError) {
            logError("Failed to parse safety API response:", parseError);
            return { safe: false, reason: "Safety check failed" };
        }

        // Validate response structure
        if (!data || typeof data !== "object") {
            logError("Invalid safety API response format:", data);
            return { safe: false, reason: "Safety check failed" };
        }

        const choices = (data as Record<string, unknown>).choices;
        if (!Array.isArray(choices) || choices.length === 0) {
            logError("No choices in safety API response:", data);
            return { safe: false, reason: "Safety check failed" };
        }

        const message = (choices[0] as Record<string, unknown>)?.message;
        if (!message || typeof message !== "object") {
            logError("No message in safety API response:", data);
            return { safe: false, reason: "Safety check failed" };
        }

        const result = String((message as Record<string, unknown>).content || "").trim();
        if (!result) {
            logError("Empty content in safety API response:", data);
            return { safe: false, reason: "Safety check failed" };
        }

        log("Safety check result:", result);

        return parseResponse(result);
    } catch (error) {
        logError("Safety check error:", error);
        // Fail closed on errors - safety first
        return { safe: false, reason: "Safety check failed" };
    }
}

type MessageContent = { type: string; text?: string; image_url?: { url: string } };

/**
 * Builds the message content array with text and optional images
 * Downloads and resizes images in parallel for speed
 */
async function buildMessageContent(
    prompt: string,
    imageUrls: string[],
): Promise<MessageContent[]> {
    const content: MessageContent[] = [];

    // Send user prompt as-is (no interpolation to avoid prompt injection)
    content.push({
        type: "text",
        text: prompt,
    });

    // Download and resize images in parallel
    if (imageUrls.length > 0) {
        const validUrls = imageUrls.filter((url) => url && url.trim());
        const imagePromises = validUrls.map((url) => downloadAndResize(url.trim()));
        const results = await Promise.allSettled(imagePromises);

        for (const result of results) {
            if (result.status === "fulfilled" && result.value) {
                content.push({
                    type: "image_url",
                    image_url: { url: result.value },
                });
            }
        }
    }

    return content;
}

/**
 * Downloads image, resizes to small size, returns as base64 data URL
 * Uses sharp for fast resizing
 */
async function downloadAndResize(url: string): Promise<string | null> {
    // Validate URL format
    try {
        new URL(url);
    } catch {
        log(`Invalid image URL format: ${url}`);
        return null;
    }

    let response: Response;
    try {
        response = await fetch(url, {
            signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
        });
    } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === "TimeoutError") {
            log(`Image download timeout: ${url}`);
        } else {
            log(`Image download failed: ${url}`, fetchError);
        }
        return null;
    }

    if (!response.ok) {
        log(`Image download HTTP error ${response.status}: ${url}`);
        return null;
    }

    // Check Content-Length to avoid downloading huge files
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        log(`Image too large (${contentLength} bytes): ${url}`);
        return null;
    }

    let buffer: Buffer;
    try {
        buffer = Buffer.from(await response.arrayBuffer());
    } catch (bufferError) {
        log(`Failed to read image buffer: ${url}`, bufferError);
        return null;
    }

    if (buffer.length === 0) {
        log(`Empty image buffer: ${url}`);
        return null;
    }

    try {
        // Resize to small size for token efficiency
        const resized = await sharp(buffer)
            .resize(SAFETY_IMAGE_SIZE, SAFETY_IMAGE_SIZE, {
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 70 })
            .toBuffer();

        const base64 = resized.toString("base64");
        return `data:image/jpeg;base64,${base64}`;
    } catch (sharpError) {
        log(`Failed to resize image (may be invalid format): ${url}`, sharpError);
        return null;
    }
}

/**
 * Parses the model response into a SafetyCheckResult
 */
function parseResponse(response: string): SafetyCheckResult {
    const normalized = response.trim().toUpperCase();

    if (normalized === "SAFE") {
        return { safe: true };
    }

    if (normalized === "UNSAFE") {
        return { safe: false, reason: "Content violates safety guidelines" };
    }

    // Handle edge cases where model adds extra text
    if (normalized.startsWith("SAFE")) {
        return { safe: true };
    }

    if (normalized.startsWith("UNSAFE")) {
        return { safe: false, reason: "Content violates safety guidelines" };
    }

    // Default to unsafe if response is unclear (fail-closed)
    logError("Unclear safety response, blocking request:", response);
    return { safe: false, reason: "Safety check inconclusive" };
}

const SAFETY_SYSTEM_PROMPT = `You are a content safety classifier for an image generation API. The user will send you an image generation prompt (and optionally reference images). Your job is to classify if this request should be allowed or blocked.

Respond with ONLY one word: SAFE or UNSAFE
No explanations, no punctuation, no additional text.

BLOCK (respond UNSAFE):
- Explicit sexual content, pornography
- Child exploitation or sexualization of minors
- Graphic violence, gore, torture
- Hate speech, slurs
- Requests to undress/sexualize people
- Non-consensual intimate imagery

ALLOW (respond SAFE):
- Swimwear, bikinis, beach scenes
- Artistic nudity (classical art, sculptures, figure drawing)
- Medical/anatomical illustrations
- Fitness, fashion, athletic wear
- Violence in movies/games/history context
- Educational content

Context matters:
- "nude lipstick" = SAFE (cosmetics)
- "renaissance venus painting" = SAFE (art)
- "woman at beach in bikini" = SAFE (normal)
- "naked woman" without artistic context = UNSAFE

Output ONLY "SAFE" or "UNSAFE" - nothing else.`;
