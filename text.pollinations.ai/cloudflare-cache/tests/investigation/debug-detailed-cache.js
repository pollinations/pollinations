import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

// Let's test with a completely fresh prompt to see the caching sequence
const FRESH_REQUEST = {
	model: "gpt-4",
	messages: [
		{ role: "user", content: "Debug test prompt for cache investigation 2024" },
	],
	temperature: 0.1,
	stream: false,
};

async function debugDetailedCache() {
	console.log("🔍 **DETAILED CACHE DEBUG TEST**\n");

	// Clear any existing cache by using a unique prompt
	const timestamp = Date.now();
	const uniqueRequest = {
		...FRESH_REQUEST,
		messages: [
			{
				role: "user",
				content: `Debug test prompt for cache investigation ${timestamp}`,
			},
		],
	};

	console.log("📡 Making FRESH request (should be cache miss)...");
	const result1 = await makeDetailedRequest(uniqueRequest, "FRESH");

	// Wait for cache write to complete
	await new Promise((resolve) => setTimeout(resolve, 2000));

	console.log("\n📡 Making IDENTICAL request (should be direct cache hit)...");
	const result2 = await makeDetailedRequest(uniqueRequest, "IDENTICAL");

	// Wait and try one more time
	await new Promise((resolve) => setTimeout(resolve, 1000));

	console.log("\n📡 Making THIRD IDENTICAL request...");
	const result3 = await makeDetailedRequest(uniqueRequest, "THIRD");

	// Analysis
	console.log("\n📊 **DETAILED ANALYSIS:**");
	console.log(
		`Fresh Request:   ${result1.responseTime}ms | ${result1.cacheType} | ${result1.similarity} | X-Cache: ${result1.xCache}`,
	);
	console.log(
		`Second Request:  ${result2.responseTime}ms | ${result2.cacheType} | ${result2.similarity} | X-Cache: ${result2.xCache}`,
	);
	console.log(
		`Third Request:   ${result3.responseTime}ms | ${result3.cacheType} | ${result3.similarity} | X-Cache: ${result3.xCache}`,
	);

	console.log(`\nCache Key Consistency:`);
	console.log(`Fresh:  ${result1.cacheKey}`);
	console.log(`Second: ${result2.cacheKey}`);
	console.log(`Third:  ${result3.cacheKey}`);
	console.log(
		`Keys Match: ${result1.cacheKey === result2.cacheKey && result2.cacheKey === result3.cacheKey}`,
	);

	// Expected behavior analysis
	console.log(`\n🎯 **EXPECTED vs ACTUAL:**`);
	console.log(`Expected: FRESH=miss → SECOND=hit → THIRD=hit`);
	console.log(
		`Actual:   FRESH=${result1.cacheType} → SECOND=${result2.cacheType} → THIRD=${result3.cacheType}`,
	);

	if (result1.cacheType === "miss" && result2.cacheType !== "hit") {
		console.log(`\n🚨 **DIRECT CACHE FAILURE CONFIRMED**`);
		console.log(
			`The direct cache lookup is failing even after successful cache write.`,
		);
	}
}

async function makeDetailedRequest(requestBody, label) {
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

		// Get all relevant headers
		const cacheType = response.headers.get("x-cache-type") || "none";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";
		const xCache = response.headers.get("x-cache") || "N/A";
		const cacheModel = response.headers.get("x-cache-model") || "N/A";
		const cacheDate = response.headers.get("x-cache-date") || "N/A";

		console.log(
			`${label}: ${responseTime}ms | ${cacheType} | Sim: ${semanticSimilarity} | Model: ${cacheModel}`,
		);
		console.log(`  X-Cache: ${xCache} | Cache-Date: ${cacheDate}`);
		console.log(`  Cache Key: ${cacheKey.substring(0, 20)}...`);

		// Try to get a small portion of response body to verify it's working
		const bodyText = await response.text();
		const bodyPreview = bodyText.substring(0, 100).replace(/\n/g, " ");
		console.log(`  Response: ${bodyPreview}...`);

		return {
			label,
			responseTime,
			cacheType,
			similarity: semanticSimilarity,
			cacheKey: cacheKey,
			xCache,
			cacheModel,
			cacheDate,
			status: response.status,
			bodyLength: bodyText.length,
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

// Run the detailed debug test
debugDetailedCache().catch(console.error);
