import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

console.log("🔍 Fresh Cache Sequence Test");
console.log("Testing direct → semantic cache flow with new content\n");

async function testFreshSequence() {
	// Use timestamp to ensure fresh content
	const timestamp = Date.now();

	const baseMessage = `Tell me about quantum computing in ${timestamp}`;
	const similarMessage = `Explain quantum computing in ${timestamp}`;
	const differentMessage = `How do I bake cookies in ${timestamp}`;

	console.log("=== Step 1: First Request (Should be MISS) ===");
	await makeRequest(baseMessage, "Step 1 - Fresh Content");

	console.log("\n=== Step 2: Exact Same Request (Should be Direct HIT) ===");
	await makeRequest(baseMessage, "Step 2 - Direct Cache");

	console.log("\n=== Step 3: Similar Request (Should test Semantic) ===");
	await makeRequest(similarMessage, "Step 3 - Similar Content");

	console.log("\n=== Step 4: Different Topic (Should be MISS) ===");
	await makeRequest(differentMessage, "Step 4 - Different Topic");
}

async function makeRequest(content, stepName) {
	const requestBody = {
		model: "gpt-4-test", // Different model to avoid interference
		messages: [{ role: "user", content: content }],
		temperature: 0.1,
		stream: false,
	};

	console.log(`${stepName}`);
	console.log(`Request: "${content.substring(0, 50)}..."`);

	const startTime = Date.now();

	try {
		const response = await fetch(`${CACHE_URL}/openai/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		const endTime = Date.now();
		const responseTime = endTime - startTime;

		// Extract cache headers
		const xCache = response.headers.get("X-Cache") || "MISS";
		const cacheType = response.headers.get("x-cache-type") || "none";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheModel = response.headers.get("x-cache-model") || "N/A";

		console.log(`  Status: ${response.status}`);
		console.log(`  Response Time: ${responseTime}ms`);
		console.log(`  X-Cache: ${xCache}`);
		console.log(`  Cache Type: ${cacheType}`);
		console.log(`  Semantic Similarity: ${semanticSimilarity}`);
		console.log(`  Cache Model: ${cacheModel}`);

		// Analyze cache behavior
		if (cacheType === "hit" && semanticSimilarity !== "N/A") {
			console.log(
				`  ❌ BUG: Direct cache hit should not have semantic similarity!`,
			);
		} else if (cacheType === "semantic" && semanticSimilarity === "N/A") {
			console.log(`  ❌ BUG: Semantic cache hit should have similarity score!`);
		} else if (cacheType === "hit" && responseTime < 200) {
			console.log(`  ✅ Perfect: Fast direct cache hit, no semantic search`);
		} else if (cacheType === "semantic" && semanticSimilarity !== "N/A") {
			console.log(
				`  ✅ Perfect: Semantic cache hit with similarity ${semanticSimilarity}`,
			);
		} else if (cacheType === "miss" && responseTime > 1000) {
			console.log(`  ✅ Perfect: Cache miss, slow origin call`);
		}
	} catch (error) {
		console.log(`  ❌ Error: ${error.message}`);
	}
}

testFreshSequence().catch(console.error);
