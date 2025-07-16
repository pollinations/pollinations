// @ts-check

/**
 * Creates an embedding service instance.
 * @param {object} ai - The AI binding from Cloudflare Workers.
 * @returns {{ai: object, model: string}}
 */
export function createEmbeddingService(ai) {
	return {
		ai,
		model: "@cf/baai/bge-base-en-v1.5",
	};
}

/**
 * Generates an embedding for the given text.
 * @param {{ai: any, model: string}} service - The embedding service instance.
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(service, text) {
	const response = await service.ai.run(service.model, {
		text,
		pooling: "cls",
	});

	if (!response.data || !response.data[0]) {
		throw new Error(
			"Failed to generate embedding: Invalid response from AI service",
		);
	}

	return response.data[0];
}
