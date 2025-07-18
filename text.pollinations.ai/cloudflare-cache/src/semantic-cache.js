import {
	createEmbeddingService,
	generateEmbedding,
} from "./embedding-service.js";
import {
	SEMANTIC_SIMILARITY_THRESHOLD,
	SEMANTIC_CACHE_ENABLED,
} from "./config.js";

// Create a semantic cache instance
export function createSemanticCache(env) {
	return {
		r2: env.TEXT_BUCKET,
		vectorize: env.VECTORIZE_INDEX,
		ai: env.AI,
		similarityThreshold: SEMANTIC_SIMILARITY_THRESHOLD,
		embeddingService: createEmbeddingService(env.AI),
	};
}

// Find similar text in cache for a specific model and user
export async function findSimilarText(
	cache,
	text,
	modelName = "unknown",
	userPrefix = "anon",
) {
	console.log(
		`[SEMANTIC_CACHE] findSimilarText called with model: ${modelName}, userPrefix: ${userPrefix}, text length: ${text.length}`,
	);

	if (!SEMANTIC_CACHE_ENABLED) {
		console.log("[SEMANTIC_CACHE] Semantic cache is disabled");
		return null;
	}

	// Check if Vectorize is available (not available in local dev)
	if (!cache.vectorize) {
		console.log(
			"[SEMANTIC_CACHE] Vectorize not available, skipping semantic search",
		);
		return null;
	}

	console.log(
		"[SEMANTIC_CACHE] Vectorize is available, proceeding with semantic search",
	);

	try {
		const embedding = await generateEmbedding(cache.embeddingService, text);

		// Query with model-specific AND user-specific metadata filter - TEMPORARILY DISABLED FOR DEBUGGING
		const searchResults = await cache.vectorize.query(embedding, {
			topK: 1,
			// filter: {
			//   model: modelName,
			//   userPrefix: userPrefix
			// },
			returnMetadata: "all",
		});

		console.log("[SEMANTIC CACHE] raw result: ", searchResults);

		if (searchResults.matches.length === 0) {
			console.log(
				`[SEMANTIC_CACHE] No matches in Vectorize. Returning similarity 0`,
			);
			return {
				cacheKey: null,
				similarity: 0,
				model: modelName,
				userPrefix,
				aboveThreshold: false,
			};
		}

		const bestMatch = searchResults.matches[0];
		if (bestMatch.score >= cache.similarityThreshold) {
			console.log(
				`[SEMANTIC_CACHE] Found similar text for model ${modelName}, user ${userPrefix}: score=${bestMatch.score}`,
			);
			return {
				cacheKey: bestMatch.id,
				similarity: bestMatch.score,
				model: bestMatch.metadata?.model || "unknown",
				userPrefix: bestMatch.metadata?.userPrefix || "anon",
				aboveThreshold: true,
			};
		}

		console.log(
			`[SEMANTIC_CACHE] Best match similarity below threshold: ${bestMatch.score} < ${cache.similarityThreshold}`,
		);
		return {
			cacheKey: null,
			similarity: bestMatch.score,
			model: bestMatch.metadata?.model || "unknown",
			userPrefix: bestMatch.metadata?.userPrefix || "anon",
			aboveThreshold: false,
		};
	} catch (error) {
		console.error("[SEMANTIC_CACHE] Error finding similar text:", error);
		return null;
	}
}

// Cache text embedding asynchronously with model and user metadata
export async function cacheTextEmbedding(
	cache,
	cacheKey,
	text,
	modelName = "unknown",
	userPrefix = "anon",
) {
	if (!SEMANTIC_CACHE_ENABLED) return;

	// Check if Vectorize is available (not available in local dev)
	if (!cache.vectorize) {
		console.log(
			"[SEMANTIC_CACHE] Vectorize not available, skipping embedding cache",
		);
		return;
	}

	try {
		const embedding = await generateEmbedding(cache.embeddingService, text);
		// Debug preview of embedding
		if (Array.isArray(embedding)) {
			const preview = embedding
				.slice(0, 5)
				.map((v) => v.toFixed(4))
				.join(", ");
			console.log(
				`[SEMANTIC_CACHE] Embedding preview [${preview}] (dims: ${embedding.length})`,
			);
		}

		// Store vector with model AND user metadata for filtering
		const upsertResult = await cache.vectorize.upsert([
			{
				id: cacheKey,
				values: embedding,
				metadata: {
					model: modelName,
					userPrefix: userPrefix,
					cached_at: new Date().toISOString(),
				},
			},
		]);
		console.log("[SEMANTIC_CACHE] Upsert result:", upsertResult);

		console.log(
			`[SEMANTIC_CACHE] Cached embedding for key: ${cacheKey}, model: ${modelName}, user: ${userPrefix}`,
		);
	} catch (error) {
		console.error("[SEMANTIC_CACHE] Error caching text embedding:", error);
	}
}
