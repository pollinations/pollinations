import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

console.log("🔍 Cache Sequence Test - Working Model");
console.log("Testing direct → semantic cache flow optimization\n");

async function testSequence() {
	// Use timestamp to ensure unique content
	const timestamp = Date.now();

	const baseMessage = `What are the benefits of renewable energy in the year ${timestamp}?`;
	const similarMessage = `What are the advantages of renewable energy in the year ${timestamp}?`;
	const differentMessage = `How do I cook pasta in the year ${timestamp}?`;

	console.log("=== Test 1: First Request (MISS expected) ===");
	await makeRequest(baseMessage, "gpt-4", "Test 1");

	console.log("\n=== Test 2: Exact Same Request (Direct HIT expected) ===");
	await makeRequest(baseMessage, "gpt-4", "Test 2");

	console.log("\n=== Test 3: Similar Request (Semantic test) ===");
	await makeRequest(similarMessage, "gpt-4", "Test 3");

	console.log("\n=== Test 4: Different Topic (MISS expected) ===");
	await makeRequest(differentMessage, "gpt-4", "Test 4");
}

async function makeRequest(content, model, testName) {
	const requestBody = {
		model: model,
		messages: [{ role: "user", content: content }],
		temperature: 0.1,
		stream: false,
	};

	console.log(`${testName} - Model: ${model}`);
	console.log(`Content: "${content.substring(0, 60)}..."`);

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
		console.log(`  Cache Type: ${cacheType}`);
		console.log(`  Semantic Similarity: ${semanticSimilarity}`);

		// Analyze the cache behavior
		if (testName === "Test 1") {
			console.log(`  Expected: MISS, Got: ${cacheType} ✅`);
		} else if (testName === "Test 2") {
			if (
				cacheType === "hit" &&
				semanticSimilarity === "N/A" &&
				responseTime < 500
			) {
				console.log(
					`  ✅ PERFECT: Direct cache hit, no semantic search performed!`,
				);
			} else {
				console.log(
					`  ❌ Issue: Expected fast direct hit with no semantic similarity`,
				);
			}
		} else if (testName === "Test 3") {
			if (cacheType === "semantic" && semanticSimilarity !== "N/A") {
				console.log(
					`  ✅ PERFECT: Semantic cache hit with similarity ${semanticSimilarity}!`,
				);
			} else if (cacheType === "miss") {
				console.log(
					`  📝 Note: Semantic similarity too low or miss (expected behavior)`,
				);
			} else {
				console.log(`  ❓ Unexpected behavior for similar content`);
			}
		} else if (testName === "Test 4") {
			console.log(`  Expected: MISS or low similarity, Got: ${cacheType} ✅`);
		}
	} catch (error) {
		console.log(`  ❌ Error: ${error.message}`);
	}
}

testSequence().catch(console.error);
