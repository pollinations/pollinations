/**
 * Embedding Service for Vectorize Image Caching
 * Based on GitHub issue #2562 research and Cloudflare Vectorize V2 API
 * Uses BGE model with CLS pooling for improved accuracy
 */

export type EmbeddingService = {
    ai: Ai;
    model: "@cf/baai/bge-base-en-v1.5";
};

/**
 * Create an embedding service instance
 * @param {Object} ai - Workers AI binding
 * @returns {Object} - Service instance
 */
export function createEmbeddingService(ai: Ai): EmbeddingService {
    return {
        ai,
        model: "@cf/baai/bge-base-en-v1.5",
    };
}

function isAsyncResponse(response: unknown): response is AsyncResponse {
    return (
        typeof response === "object" &&
        response !== null &&
        "request_id" in response
    );
}

/**
 * Generate embedding for a prompt using BGE model with CLS pooling
 * @param {EmbeddingService} service - Embedding service instance
 * @param {string} prompt - The image prompt
 * @returns {Promise<number[]>} - 768-dimensional embedding vector
 */
export async function generateEmbedding(
    service: EmbeddingService,
    prompt: string,
): Promise<number[]> {
    try {
        // Normalize the prompt for consistent embeddings
        const normalizedText = normalizePromptForEmbedding(prompt);

        console.log(
            `[EMBEDDING] Generating embedding for: "${normalizedText.substring(0, 100)}..."`,
        );

        // Generate embedding using Workers AI with CLS pooling for better accuracy
        const response = await service.ai.run(service.model, {
            text: normalizedText,
            pooling: "cls", // Use CLS pooling for better accuracy on longer inputs
        });

        if (isAsyncResponse(response)) {
            throw new Error("Async (batch) embedding generation not handled");
        } else if (!response.data || !Array.isArray(response.data[0])) {
            throw new Error("Invalid embedding response format");
        }

        return response.data[0]; // 768-dimensional vector
    } catch (error) {
        console.error("[EMBEDDING] Error generating embedding:", error);
        throw error;
    }
}

/**
 * Normalize prompt for consistent embeddings with semantic parameters
 * @param {string} prompt - Original prompt
 * @returns {string} - Normalized text for embedding
 */
export function normalizePromptForEmbedding(prompt: string): string {
    // Clean and normalize the prompt - only use the pure prompt text
    // Model, style, and quality are handled through metadata filtering and bucketing
    let normalized = prompt.toLowerCase().trim();

    // Remove all punctuation for consistent embeddings
    // This ensures "test." and "test..." and "test" all produce the same embedding
    normalized = normalized.replace(/[^\w\s]/g, " ");

    // Normalize whitespace (replace multiple spaces with single space)
    normalized = normalized.replace(/\s+/g, " ").trim();

    return normalized;
}

/**
 * Create resolution bucket key with seed, nologo, and image isolation
 * Different seeds should NOT match semantically as they produce different images
 * Images with/without logos are also visually different and shouldn't match
 * Image-to-image vs text-only generation produce fundamentally different outputs
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {string|number} seed - Image generation seed
 * @param {boolean|string} nologo - Whether logo should be excluded
 * @param {string} image - Base64 image for image-to-image generation
 * @returns {string} - Resolution bucket key with complete parameter isolation
 */
export function getResolutionBucket(
    width: number = 1024,
    height: number = 1024,
    seed: string | number | null = null,
    nologo: boolean = false,
    image: string | null = null,
): string {
    const resolution = `${width}x${height}`;

    // Build bucket key with relevant visual parameters
    let bucket = resolution;

    // Include seed in bucket for proper isolation
    // Different seeds can produce significantly different images even with same prompt
    if (seed !== null && seed !== undefined) {
        bucket += `_seed${seed}`;
    }

    // Include nologo status since images with/without logos are visually different
    if (nologo !== null && nologo !== undefined) {
        bucket += `_nologo${nologo}`;
    }

    // Include image parameter for image-to-image vs text-only isolation
    // Image-to-image generation produces fundamentally different outputs
    if (image !== null && image !== undefined && image !== "") {
        // Use a short hash of the image to avoid bucket name explosion
        // Different images should be in different buckets but same image should match
        bucket += `_img${image.substring(0, 8)}`;
    }

    return bucket;
}
