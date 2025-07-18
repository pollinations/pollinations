import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

// Test creating fresh cache entries with unique prompts, then test direct cache hit
async function testFreshCacheEntries() {
	console.log(
		"🔍 **TEST: Fresh Cache Entry Creation and Direct Hit Verification**\n",
	);

	const timestamp = Date.now();
	const uniquePrompts = [
		`What is machine learning and how does it work? [Test ${timestamp}-A]`,
		`How do I cook pasta? [Test ${timestamp}-B]`,
	];

	for (let i = 0; i < uniquePrompts.length; i++) {
		const prompt = uniquePrompts[i];
		console.log(`📡 Testing with unique prompt: "${prompt}"`);

		// First request - should be cache miss
		const request = {
			model: "gpt-4",
			messages: [{ role: "user", content: prompt }],
			temperature: 0.1,
			stream: false,
		};

		console.log("  First request (should be MISS):");
		const result1 = await makeRequest(request, "FIRST");

		// Wait for cache to be written
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Second request - should be direct cache hit
		console.log("  Second request (should be direct HIT):");
		const result2 = await makeRequest(request, "SECOND");

		// Third request - should also be direct cache hit
		console.log("  Third request (should be direct HIT):");
		const result3 = await makeRequest(request, "THIRD");

		// Analysis
		console.log(`\n📊 **Analysis for prompt ${i + 1}:**`);
		console.log(
			`  First:  ${result1.responseTime}ms | ${result1.cacheType} | ${result1.similarity}`,
		);
		console.log(
			`  Second: ${result2.responseTime}ms | ${result2.cacheType} | ${result2.similarity}`,
		);
		console.log(
			`  Third:  ${result3.responseTime}ms | ${result3.cacheType} | ${result3.similarity}`,
		);

		const expectedPattern =
			result1.cacheType === "miss" &&
			result2.cacheType === "hit" &&
			result3.cacheType === "hit";
		console.log(
			`  Expected Pattern (miss → hit → hit): ${expectedPattern ? "✅" : "❌"}`,
		);

		if (!expectedPattern) {
			console.log(
				`  🚨 ISSUE: Expected miss → hit → hit, got ${result1.cacheType} → ${result2.cacheType} → ${result3.cacheType}`,
			);
		}

		console.log("\n" + "=".repeat(80) + "\n");
	}
}

async function makeRequest(requestBody, label) {
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
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";
		const xCache = response.headers.get("x-cache") || "N/A";

		console.log(
			`    ${label}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | X-Cache: ${xCache}`,
		);

		return {
			label,
			responseTime,
			cacheType,
			similarity: semanticSimilarity,
			cacheKey: cacheKey,
			xCache,
			status: response.status,
		};
	} catch (error) {
		console.log(`    ${label}: ERROR | ${error.message}`);
		return {
			label,
			responseTime: null,
			cacheType: "error",
			similarity: null,
			cacheKey: null,
			xCache: null,
			status: "error",
		};
	}
}

// Run the test
testFreshCacheEntries().catch(console.error);
