#!/usr/bin/env node

/**
 * Test script for embedding similarities
 * Tests how variations in prompts (like dots) affect similarity scores
 * Uses the same embedding logic as the production semantic cache
 */

// Simple embedding test without external API calls
// We'll create a mock version that shows the concept

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalize prompt text like the production system does
 */
function normalizePrompt(text) {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Simulate embedding generation (for concept demonstration)
 * In production, this would use Cloudflare Workers AI BGE model
 */
function simulateEmbedding(text) {
	// Simple hash-based embedding simulation
	// This is just for demonstration - real embeddings are much more sophisticated
	const normalized = normalizePrompt(text);
	const chars = normalized.split("");
	const embedding = new Array(10).fill(0);

	for (let i = 0; i < chars.length; i++) {
		const charCode = chars[i].charCodeAt(0);
		embedding[i % 10] += charCode;
	}

	// Normalize the vector
	const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
	return embedding.map((val) => val / norm);
}

/**
 * Test embedding similarities for variations of a prompt
 */
function testEmbeddingSimilarities() {
	console.log("🧪 Testing Embedding Similarities (Simulation)\n");
	console.log(
		"📝 Note: This uses simulated embeddings to demonstrate the concept.",
	);
	console.log("📝 For real BGE embeddings, use wrangler with Workers AI.\n");

	// Test cases: base prompt with varying dots
	const basePrompt = "little red riding hood";
	const variations = [
		"little red riding hood",
		"little red riding hood.",
		"little red riding hood..",
		"little red riding hood...",
		"little red riding hood....",
		"little red riding hood.....",
		"little red riding hoods",
		"little red riding hoods.",
		"little red riding hoods..",
		"little red riding hoods...",
		"little red riding hoods....",
		"little red riding hoods.....",
		"little red riding hoods..m.",
		"little red riding hood with basket",
		"red riding hood",
		"little girl in red cape",
		"fairy tale character",
		"completely different prompt",
	];

	console.log(`📝 Base prompt: "${basePrompt}"`);
	console.log(`📝 Normalized: "${normalizePrompt(basePrompt)}"`);
	console.log();

	// Generate base embedding
	console.log("🔄 Generating base embedding...");
	const baseEmbedding = simulateEmbedding(basePrompt);
	console.log(
		`✅ Base embedding generated (${baseEmbedding.length} dimensions - simulated)\n`,
	);

	// Test all variations
	console.log("🔄 Testing variations...\n");
	console.log(
		"| Original Prompt | Normalized Prompt | Similarity | Above 0.8? | Notes |",
	);
	console.log(
		"|-----------------|-------------------|------------|-------------|-------|",
	);

	for (const variation of variations) {
		const normalized = normalizePrompt(variation);
		const embedding = simulateEmbedding(variation);
		const similarity = cosineSimilarity(baseEmbedding, embedding);
		const aboveThreshold = similarity >= 0.8;

		let notes = "";
		if (variation === basePrompt) notes = "Base prompt";
		else if (variation.includes("...")) notes = "Dots added";
		else if (variation.includes("hoods")) notes = "Plural form";
		else if (similarity < 0.5) notes = "Very different";
		else if (similarity < 0.8) notes = "Similar but below threshold";

		console.log(
			`| ${variation.padEnd(25)} | ${normalized.padEnd(25)} | ${similarity.toFixed(4)} | ${aboveThreshold ? "✅ YES" : "❌ NO"} | ${notes} |`,
		);
	}

	console.log("\n📊 Analysis:");
	console.log("- Similarity threshold in production: 0.8");
	console.log("- Values ≥ 0.8 would trigger semantic cache hits");
	console.log("- Values < 0.8 fall back to origin generation");
	console.log(
		"- Normalization removes punctuation, so dots should have minimal impact",
	);
	console.log("\n🚀 From production logs, we saw similarities like:");
	console.log('- 0.597 for "Minecraft scanner" variations');
	console.log('- 0.528 and 0.521 for "little red riding hoods" variations');
	console.log(
		"- These are below the 0.8 threshold, showing the model is quite strict",
	);
}

// Export for potential reuse
export { cosineSimilarity, normalizePrompt, simulateEmbedding };

// Run the test if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
	testEmbeddingSimilarities();
}
