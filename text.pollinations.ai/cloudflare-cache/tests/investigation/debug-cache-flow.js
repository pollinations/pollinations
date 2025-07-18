import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

console.log("🔍 Cache Flow Debug Test");
console.log("Investigating why direct cache hits show semantic similarity\n");

async function testCacheFlow() {
	const testMessage = "Hello, can you help me understand machine learning?";

	console.log("=== Step 1: First Request (Should be MISS) ===");
	await makeRequest(testMessage, "Step 1");

	console.log("\n=== Step 2: Exact Same Request (Should be Direct HIT) ===");
	await makeRequest(testMessage, "Step 2");

	console.log(
		"\n=== Step 3: Slightly Different Request (Should be Semantic or MISS) ===",
	);
	await makeRequest(
		"Hi, can you help me understand machine learning?",
		"Step 3",
	);
}

async function makeRequest(content, stepName) {
	const requestBody = {
		model: "gpt-4",
		messages: [{ role: "user", content: content }],
		temperature: 0.3,
		stream: false,
	};

	console.log(`${stepName} - Request: "${content}"`);

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

		// Extract all cache-related headers
		const xCache = response.headers.get("X-Cache") || "MISS";
		const cacheType = response.headers.get("x-cache-type") || "none";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheModel = response.headers.get("x-cache-model") || "N/A";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";
		const cacheDate = response.headers.get("x-cache-date") || "N/A";

		console.log(`  Status: ${response.status}`);
		console.log(`  Response Time: ${responseTime}ms`);
		console.log(`  X-Cache: ${xCache}`);
		console.log(`  Cache Type: ${cacheType}`);
		console.log(`  Semantic Similarity: ${semanticSimilarity}`);
		console.log(`  Cache Model: ${cacheModel}`);
		console.log(`  Cache Key: ${cacheKey.substring(0, 20)}...`);
		console.log(`  Cache Date: ${cacheDate}`);

		// Log the actual behavior vs expected
		if (stepName === "Step 1") {
			console.log(`  ✅ Expected: MISS, Got: ${cacheType}`);
		} else if (stepName === "Step 2") {
			console.log(
				`  🔍 Expected: Direct HIT (no semantic similarity), Got: ${cacheType} with ${semanticSimilarity} similarity`,
			);
			if (semanticSimilarity !== "N/A" && cacheType === "hit") {
				console.log(
					`  ❌ BUG: Direct cache hit should NOT have semantic similarity!`,
				);
			}
		} else if (stepName === "Step 3") {
			console.log(
				`  🔍 Expected: Semantic match or MISS, Got: ${cacheType} with ${semanticSimilarity} similarity`,
			);
		}
	} catch (error) {
		console.log(`  ❌ Error: ${error.message}`);
	}
}

testCacheFlow().catch(console.error);
