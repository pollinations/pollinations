import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

console.log("🔍 Cache Key Debug Test");
console.log("Testing if cache keys are deterministic across runs\n");

async function testCacheKeys() {
	const testPrompt = "What is machine learning?";

	console.log("=== Test 1: First Request ===");
	const result1 = await makeRequest(testPrompt, "FIRST");

	console.log("\n=== Test 2: Same Request (should hit cache) ===");
	const result2 = await makeRequest(testPrompt, "SECOND");

	console.log("\n=== Test 3: Same Request Again ===");
	const result3 = await makeRequest(testPrompt, "THIRD");

	console.log("\n🔍 **CACHE KEY ANALYSIS:**");
	console.log(`Request 1 Cache Type: ${result1.cacheType}`);
	console.log(`Request 2 Cache Type: ${result2.cacheType}`);
	console.log(`Request 3 Cache Type: ${result3.cacheType}`);

	if (
		result1.cacheType === "miss" &&
		result2.cacheType === "hit" &&
		result3.cacheType === "hit"
	) {
		console.log("✅ Cache is working correctly - deterministic keys!");
	} else if (
		result1.cacheType === result2.cacheType &&
		result2.cacheType === result3.cacheType
	) {
		console.log(
			"❌ All requests have same cache type - possible non-deterministic keys",
		);
	} else {
		console.log("❓ Mixed results - investigating further needed");
	}
}

async function makeRequest(content, testName) {
	const requestBody = {
		model: "gpt-4",
		messages: [{ role: "user", content: content }],
		temperature: 0.1,
		stream: false,
	};

	console.log(`${testName} - Request: "${content}"`);

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

		const cacheType = response.headers.get("x-cache-type") || "none";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";

		console.log(`  Status: ${response.status}`);
		console.log(`  Response Time: ${responseTime}ms`);
		console.log(`  Cache Type: ${cacheType}`);
		console.log(`  Cache Key: ${cacheKey.substring(0, 20)}...`);
		console.log(`  Semantic Similarity: ${semanticSimilarity}`);

		return {
			testName,
			prompt: content,
			responseTime,
			cacheType,
			cacheKey,
			similarity: semanticSimilarity,
			status: response.status,
		};
	} catch (error) {
		console.log(`  ❌ Error: ${error.message}`);
		return {
			testName,
			prompt: content,
			responseTime: null,
			cacheType: "error",
			cacheKey: null,
			similarity: null,
			status: "error",
		};
	}
}

testCacheKeys().catch(console.error);
