import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

// Test with the problematic prompt that was getting semantic hits
const AI_REQUEST = {
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

async function debugExistingCache() {
	console.log("🔍 **DEBUG: Existing Cache Behavior**\n");
	console.log(
		"Testing the problematic AI prompt that was getting semantic hits...\n",
	);

	// Make the request that was problematic
	console.log("📡 Making AI question request...");
	const result1 = await makeDetailedRequest(AI_REQUEST, "AI-Q1");

	await new Promise((resolve) => setTimeout(resolve, 500));

	console.log("\n📡 Making IDENTICAL AI question request...");
	const result2 = await makeDetailedRequest(AI_REQUEST, "AI-Q2");

	await new Promise((resolve) => setTimeout(resolve, 500));

	console.log("\n📡 Making THIRD IDENTICAL AI question request...");
	const result3 = await makeDetailedRequest(AI_REQUEST, "AI-Q3");

	// Analysis
	console.log("\n📊 **ANALYSIS:**");
	console.log(
		`First AI Request:  ${result1.responseTime}ms | ${result1.cacheType} | ${result1.similarity} | X-Cache: ${result1.xCache}`,
	);
	console.log(
		`Second AI Request: ${result2.responseTime}ms | ${result2.cacheType} | ${result2.similarity} | X-Cache: ${result2.xCache}`,
	);
	console.log(
		`Third AI Request:  ${result3.responseTime}ms | ${result3.cacheType} | ${result3.similarity} | X-Cache: ${result3.xCache}`,
	);

	console.log(`\nCache Keys:`);
	console.log(`First:  ${result1.cacheKey?.substring(0, 20)}...`);
	console.log(`Second: ${result2.cacheKey?.substring(0, 20)}...`);
	console.log(`Third:  ${result3.cacheKey?.substring(0, 20)}...`);

	// Diagnostic
	if (result1.cacheType === "semantic") {
		console.log(`\n🔍 **DIAGNOSTIC:**`);
		console.log(
			`The AI question is finding a semantic match with similarity ${result1.similarity}`,
		);
		console.log(
			`This means there's already similar content in the vector cache.`,
		);
	}

	if (result1.cacheType === "semantic" && result2.cacheType === "semantic") {
		console.log(`\n❓ **THE MYSTERY:**`);
		console.log(
			`Even identical requests are going through semantic cache instead of direct cache.`,
		);
		console.log(
			`This suggests the semantic cache might be finding a DIFFERENT cached response`,
		);
		console.log(`with high similarity, not the exact same response.`);
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

		const cacheType = response.headers.get("x-cache-type") || "none";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";
		const xCache = response.headers.get("x-cache") || "N/A";
		const cacheModel = response.headers.get("x-cache-model") || "N/A";

		console.log(
			`${label}: ${responseTime}ms | ${cacheType} | Sim: ${semanticSimilarity} | Model: ${cacheModel}`,
		);
		console.log(`  X-Cache: ${xCache}`);
		console.log(`  Cache Key: ${cacheKey?.substring(0, 40)}...`);

		return {
			label,
			responseTime,
			cacheType,
			similarity: semanticSimilarity,
			cacheKey: cacheKey,
			xCache,
			cacheModel,
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

// Run the existing cache debug test
debugExistingCache().catch(console.error);
