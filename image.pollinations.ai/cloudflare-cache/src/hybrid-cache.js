/**
 * Hybrid Cache Integration for Semantic Image Caching
 * Integrates semantic cache (Vectorize) with existing exact cache (R2)
 *
 * Hybrid Flow:
 * 1. Check exact cache (R2) - existing logic
 * 2. If miss, check semantic cache (Vectorize)
 * 3. If miss, fetch from origin
 * 4. Store in both R2 and Vectorize asynchronously
 */

import {
	createSemanticCache,
	findSimilarImage,
	cacheImageEmbedding,
} from "./semantic-cache.js";

/**
 * Create hybrid cache instance
 * @param {Object} env - Environment bindings
 * @returns {Object} - Hybrid cache instance
 */
export function createHybridCache(env) {
	// Only create semantic cache if bindings are available
	const hasSemanticSupport = env.VECTORIZE_INDEX && env.AI;

	return {
		r2: env.IMAGE_BUCKET,
		semanticCache: hasSemanticSupport ? createSemanticCache(env) : null,
		hasSemanticSupport,
	};
}

/**
 * Check semantic cache for similar images (after exact cache miss)
 * @param {Object} hybridCache - Hybrid cache instance
 * @param {string} prompt - Image prompt from URL
 * @param {Object} params - Request parameters
 * @returns {Promise<Object|null>} - Similar image info or null
 */
export async function checkSemanticCache(hybridCache, prompt, params) {
	// Skip semantic cache if not supported
	if (!hybridCache.hasSemanticSupport || !hybridCache.semanticCache) {
		console.log("[HYBRID] Semantic cache not available, skipping");
		return null;
	}

	// Skip if no prompt provided
	if (!prompt || typeof prompt !== "string") {
		console.log("[HYBRID] No valid prompt for semantic search");
		return null;
	}

	try {
		console.log("[HYBRID] Checking semantic cache for similar images...");
		const similarImage = await findSimilarImage(
			hybridCache.semanticCache,
			prompt,
			params,
		);

		if (similarImage) {
			console.log(
				`[HYBRID] Found semantic match: ${similarImage.cacheKey} (similarity: ${similarImage.similarity.toFixed(3)})`,
			);
			return {
				cacheKey: similarImage.cacheKey,
				similarity: similarImage.similarity,
				bucket: similarImage.bucket,
				cacheType: "semantic",
			};
		}

		console.log("[HYBRID] No semantic matches found");
		return null;
	} catch (error) {
		console.error("[HYBRID] Semantic cache check failed:", error);
		return null; // Graceful fallback
	}
}

/**
 * Store image embedding asynchronously (after successful cache or generation)
 * @param {Object} hybridCache - Hybrid cache instance
 * @param {string} cacheKey - R2 cache key
 * @param {string} prompt - Image prompt
 * @param {Object} params - Request parameters
 * @param {ExecutionContext} ctx - Execution context for waitUntil
 */
export function storeImageEmbeddingAsync(
	hybridCache,
	cacheKey,
	prompt,
	params,
	ctx,
) {
	// Skip if semantic cache not supported
	if (!hybridCache.hasSemanticSupport || !hybridCache.semanticCache) {
		return;
	}

	// Skip if no prompt provided
	if (!prompt || typeof prompt !== "string") {
		return;
	}

	try {
		console.log(`[HYBRID] Scheduling async embedding storage for: ${cacheKey}`);

		// Use waitUntil to store embedding asynchronously without blocking response
		ctx.waitUntil(
			cacheImageEmbedding(
				hybridCache.semanticCache,
				cacheKey,
				prompt,
				params,
			).catch((error) => {
				console.error("[HYBRID] Async embedding storage failed:", error);
				// Don't throw - this shouldn't break the request
			}),
		);
	} catch (error) {
		console.error(
			"[HYBRID] Failed to schedule async embedding storage:",
			error,
		);
		// Don't throw - this shouldn't break the request
	}
}

/**
 * Extract prompt from URL path for semantic caching
 * @param {URL} url - Request URL
 * @returns {string|null} - Extracted prompt or null
 */
export function extractPromptFromUrl(url) {
	try {
		// Extract prompt from path like /prompt/sunset+over+ocean
		const pathMatch = url.pathname.match(/^\/prompt\/(.+)$/);
		if (pathMatch) {
			// Decode the prompt, but do not replace '+' with spaces in the path
			const prompt = decodeURIComponent(pathMatch[1]).trim();
			return prompt || null;
		}

		// Extract prompt from query parameter
		const promptParam = url.searchParams.get("prompt");
		if (promptParam) {
			return promptParam.trim() || null;
		}

		return null;
	} catch (error) {
		console.error("[HYBRID] Error extracting prompt from URL:", error);
		return null;
	}
}

/**
 * Extract image parameters from URL for semantic cache metadata
 * @param {URL} url - Request URL
 * @returns {Object} - Extracted parameters
 */
export function extractImageParams(url) {
	const params = {};

	// Extract common image parameters
	const width = url.searchParams.get("width");
	const height = url.searchParams.get("height");
	const model = url.searchParams.get("model");
	const style = url.searchParams.get("style");
	const quality = url.searchParams.get("quality");
	const seed = url.searchParams.get("seed"); // Extract seed parameter for proper isolation
	const nologo = url.searchParams.get("nologo"); // Extract nologo parameter for proper isolation

	if (width) params.width = width;
	if (height) params.height = height;
	if (model) params.model = model;
	if (style) params.style = style;
	if (quality) params.quality = quality;
	if (seed) params.seed = seed; // Include seed in parameters
	if (nologo) params.nologo = nologo; // Include nologo in parameters

	return params;
}
