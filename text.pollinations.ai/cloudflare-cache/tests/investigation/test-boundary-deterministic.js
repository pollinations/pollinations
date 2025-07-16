import fetch from "node-fetch";

const CACHE_URL = "http://localhost:8888";

// FIXED: Remove any randomness by using consistent values
const BASE_PROMPT = "What is artificial intelligence and how does it work?";

// FIXED: Deterministic test prompts (no timestamps, no random values)
const TEST_PROMPTS = [
	// IDENTICAL (Expected: Direct cache hit on second run)
	"What is artificial intelligence and how does it work?", // Exact match

	// VERY SIMILAR (Expected: Semantic hit)
	"What is AI and how does it work?",
	"Can you explain what artificial intelligence is and how it works?",

	// SIMILAR TOPIC (Expected: High similarity)
	"What are the benefits of artificial intelligence?",
	"What is machine learning vs artificial intelligence?",

	// RELATED TECH (Expected: Medium similarity)
	"What is machine learning and how does it work?",
	"What is deep learning and neural networks?",

	// DIFFERENT TOPICS (Expected: Low similarity)
	"What is the weather like today?",
	"How do I cook pasta?",
	"What is the capital of France?",
];

async function testDeterministicBoundary() {
	console.log("🎯 **DETERMINISTIC SEMANTIC BOUNDARY TEST**");
	console.log("Testing cache persistence between runs\n");

	console.log("🔄 Step 1: Establishing base cache entry...\n");

	// FIXED: Use completely deterministic request
	const baseResult = await makeRequest(BASE_PROMPT, "BASE", true);

	console.log("\n🔍 Step 2: Testing boundary prompts...\n");

	const results = [];

	for (let i = 0; i < TEST_PROMPTS.length; i++) {
		const prompt = TEST_PROMPTS[i];
		const result = await makeRequest(prompt, `TEST-${i + 1}`, false);
		results.push(result);

		// Small delay to avoid overwhelming the server
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	console.log("\n📊 **SUMMARY:**");
	const hits = results.filter((r) => r.cacheType === "hit").length;
	const semanticHits = results.filter((r) => r.cacheType === "semantic").length;
	const misses = results.filter((r) => r.cacheType === "miss").length;

	console.log(`Direct Hits: ${hits}`);
	console.log(`Semantic Hits: ${semanticHits}`);
	console.log(`Misses: ${misses}`);
	console.log(`Total: ${results.length}`);

	return { baseResult, results };
}

async function makeRequest(content, testName, isBase = false) {
	// FIXED: Completely deterministic request body - no random fields
	const requestBody = {
		model: "gpt-4", // FIXED: Consistent model
		messages: [{ role: "user", content: content }],
		temperature: 0.1, // FIXED: Consistent temperature
		stream: false, // FIXED: Consistent stream setting
		// REMOVED: Any potential random fields like seed, timestamp, etc.
	};

	const startTime = Date.now();

	try {
		const response = await fetch(`${CACHE_URL}/openai/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				// FIXED: No random headers like request-id, timestamp, etc.
			},
			body: JSON.stringify(requestBody), // FIXED: Deterministic JSON
		});

		const endTime = Date.now();
		const responseTime = endTime - startTime;

		const cacheType = response.headers.get("x-cache-type") || "none";
		const semanticSimilarity =
			response.headers.get("x-semantic-similarity") || "N/A";
		const cacheKey = response.headers.get("x-cache-key") || "N/A";

		const shortContent =
			content.length > 40 ? content.substring(0, 40) + "..." : content;

		if (isBase) {
			console.log(
				`${testName}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | "${shortContent}"`,
			);
			console.log(`  Cache Key: ${cacheKey.substring(0, 16)}...`);
		} else {
			console.log(
				`${testName}: ${responseTime}ms | ${cacheType} | ${semanticSimilarity} | "${shortContent}"`,
			);
		}

		return {
			testName,
			prompt: content,
			responseTime,
			cacheType,
			similarity: semanticSimilarity,
			cacheKey,
			status: response.status,
		};
	} catch (error) {
		console.log(`${testName}: ERROR | ${error.message}`);
		return {
			testName,
			prompt: content,
			responseTime: null,
			cacheType: "error",
			similarity: null,
			cacheKey: null,
			status: "error",
		};
	}
}

// Run the test
testDeterministicBoundary().catch(console.error);
