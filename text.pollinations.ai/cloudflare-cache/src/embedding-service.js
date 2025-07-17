// @ts-check

import { EMBEDDING_MODEL, BGE_POOLING } from "./config.js";

/**
 * Creates an embedding service instance.
 * @param {object} ai - The AI binding from Cloudflare Workers.
 * @returns {{ai: object, model: string, pooling: string}}
 */
export function createEmbeddingService(ai) {
	return {
		ai,
		model: EMBEDDING_MODEL,
		pooling: BGE_POOLING,
	};
}

/**
 * Generates an embedding for the given text.
 * @param {{ai: any, model: string, pooling: string}} service - The embedding service instance.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(service, text) {
	const response = await service.ai.run(service.model, {
		text,
		pooling: service.pooling,
	});

	if (!response.data || !response.data[0]) {
		throw new Error(
			"Failed to generate embedding: Invalid response from AI service",
		);
	}

	return response.data[0];
}
