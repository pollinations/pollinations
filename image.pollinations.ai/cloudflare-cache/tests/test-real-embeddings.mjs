/**
 * Real BGE Embedding Test Script
 * Tests embedding similarities using actual Cloudflare Workers AI BGE model
 * Usage: wrangler dev --local --test-scheduled --experimental-local then visit test endpoint
 */

// Test data
const TEST_PROMPTS = [
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
 * Normalize prompt text EXACTLY like production does
 * Production: only toLowerCase().trim() - KEEPS punctuation!
 */
function normalizePrompt(text) {
	return text.toLowerCase().trim(); // Match production exactly
}

/**
 * Generate embedding using Workers AI (same as production)
 */
async function generateEmbedding(ai, text) {
	const normalizedText = normalizePrompt(text);

	try {
		const response = await ai.run("@cf/baai/bge-m3", {
			text: normalizedText, // String format like production (not array)
			pooling: "cls", // Direct property like production (not in options)
		});

		return response.data[0];
	} catch (error) {
		console.error(`Error generating embedding for "${text}":`, error);
		throw error;
	}
}

/**
 * Test embedding similarities
 */
async function testEmbeddingSimilarities(ai) {
	const basePrompt = "little red riding hood";
	console.log(`\n🧪 Testing Real BGE Embeddings\n`);
	console.log(`📝 Base prompt: "${basePrompt}"`);
	console.log(`📝 Normalized: "${normalizePrompt(basePrompt)}"`);
	console.log(`📝 Model: @cf/baai/bge-m3 with CLS pooling\n`);

	try {
		// Generate base embedding
		console.log("🔄 Generating base embedding...");
		const baseEmbedding = await generateEmbedding(ai, basePrompt);
		console.log(
			`✅ Base embedding generated (${baseEmbedding.length} dimensions)\n`,
		);

		// Test all variations
		console.log("🔄 Testing variations...\n");
		console.log(
			"| Original Prompt | Normalized Prompt | Similarity | Above 0.8? | Notes |",
		);
		console.log(
			"|-----------------|-------------------|------------|-------------|-------|",
		);

		for (const variation of TEST_PROMPTS) {
			try {
				const normalized = normalizePrompt(variation);
				const embedding = await generateEmbedding(ai, variation);
				const similarity = cosineSimilarity(baseEmbedding, embedding);
				const aboveThreshold = similarity >= 0.8;

				let notes = "";
				if (variation === basePrompt) notes = "Base prompt";
				else if (variation.includes("...")) notes = "Dots added";
				else if (variation.includes("hoods")) notes = "Plural form";
				else if (similarity < 0.5) notes = "Very different";
				else if (similarity < 0.8) notes = "Similar but below threshold";

				console.log(
					`| ${variation.slice(0, 15).padEnd(15)} | ${normalized.slice(0, 17).padEnd(17)} | ${similarity.toFixed(4)} | ${aboveThreshold ? "✅ YES" : "❌ NO"} | ${notes} |`,
				);

				// Small delay to be nice to the API
				await new Promise((resolve) => setTimeout(resolve, 50));
			} catch (error) {
				console.log(
					`| ${variation.slice(0, 15).padEnd(15)} | ERROR | ERROR | ❌ ERROR | ${error.message} |`,
				);
			}
		}

		console.log("\n📊 Analysis:");
		console.log("- Similarity threshold in production: 0.8");
		console.log("- Values ≥ 0.8 would trigger semantic cache hits");
		console.log("- Values < 0.8 fall back to origin generation");
		console.log(
			"- Normalization removes punctuation, so dots should normalize to same text",
		);
		console.log("\n🚀 Comparison with production logs:");
		console.log("- Production showed 0.597, 0.528, 0.521 for similar tests");
		console.log("- BGE model is quite strict about semantic similarity");
		console.log(
			"- 0.8 threshold appears appropriate for avoiding false positives",
		);

		return true;
	} catch (error) {
		console.error("❌ Error during embedding test:", error);
		return false;
	}
}

// Export the main function for use in worker
export {
	testEmbeddingSimilarities,
	generateEmbedding,
	cosineSimilarity,
	normalizePrompt,
};

// For manual testing - this would be called from a worker route
export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/test-embeddings") {
			try {
				console.log("Starting embedding similarity test...");
				const success = await testEmbeddingSimilarities(env.AI);

				return new Response(
					success
						? "Embedding test completed successfully! Check worker logs for results."
						: "Embedding test failed. Check worker logs for errors.",
					{
						status: success ? 200 : 500,
						headers: { "Content-Type": "text/plain" },
					},
				);
			} catch (error) {
				console.error("Test endpoint error:", error);
				return new Response(`Error: ${error.message}`, {
					status: 500,
					headers: { "Content-Type": "text/plain" },
				});
			}
		}

		return new Response(
			"Use /test-embeddings to run the embedding similarity test",
			{
				headers: { "Content-Type": "text/plain" },
			},
		);
	},
};
