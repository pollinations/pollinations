import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

// Test the exact same request twice to see cache behavior
const TEST_REQUEST = {
	model: "gpt-4",
	messages: [
		{
			role: "user",
			content: "What is artificial intelligence and how does it work?",
		},
	],
	temperature: 0.1,
	stream: false,
};

async function debugDirectCache() {
	console.log("🔍 **DEBUG: Direct Cache Investigation**\n");

	// Make first request
	console.log("📡 Making FIRST request...");
	const result1 = await makeDebugRequest(TEST_REQUEST, "FIRST");

	// Wait a moment to ensure caching is complete
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Make identical second request
	console.log("\n📡 Making SECOND request (should be direct cache hit)...");
	const result2 = await makeDebugRequest(TEST_REQUEST, "SECOND");

	// Analysis
	console.log("\n📊 **ANALYSIS:**");
	console.log(
		`First Request:  ${result1.responseTime}ms | ${result1.cacheType} | ${result1.similarity}`,
	);
	console.log(
		`Second Request: ${result2.responseTime}ms | ${result2.cacheType} | ${result2.similarity}`,
	);

	console.log(`\nCache Keys Match: ${result1.cacheKey === result2.cacheKey}`);
	console.log(`First Cache Key:  ${result1.cacheKey}`);
	console.log(`Second Cache Key: ${result2.cacheKey}`);

	if (result1.cacheKey === result2.cacheKey && result2.cacheType !== "hit") {
		console.log("\n🚨 **PROBLEM IDENTIFIED:**");
		console.log(
			"Same cache key but second request is not getting direct cache hit!",
		);
		console.log("This indicates an issue with the direct cache lookup logic.");
	}

	// Make a third request to confirm persistence
	console.log("\n📡 Making THIRD request (another identical request)...");
	const result3 = await makeDebugRequest(TEST_REQUEST, "THIRD");
	console.log(
		`Third Request:  ${result3.responseTime}ms | ${result3.cacheType} | ${result3.similarity}`,
	);
}

async function makeDebugRequest(requestBody, label) {
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
			`${label}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | X-Cache: ${xCache}`,
		);
		console.log(`  Cache Key: ${cacheKey}`);

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
		console.log(`${label}: ERROR | ${error.message}`);
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

// Run the debug test
debugDirectCache().catch(console.error);
