#!/usr/bin/env node

/**
 * Test Semantic Cache Propagation Speed
 * Measures how quickly vectors become available for semantic search after caching
 *
 * Process:
 * 1. Generate random prompt and request it (triggers caching)
 * 2. Poll with slight variation (adding dot) until semantic match found
 * 3. Report time to propagation
 */

import fetch from "node-fetch";

// Word lists for random prompt generation
const ADJECTIVES = [
	"mysterious",
	"ancient",
	"glowing",
	"shimmering",
	"ethereal",
	"majestic",
	"vibrant",
	"serene",
	"dramatic",
	"elegant",
	"rustic",
	"futuristic",
	"crystalline",
	"volcanic",
	"frozen",
	"luminous",
	"weathered",
	"pristine",
];

const NOUNS = [
	"castle",
	"forest",
	"mountain",
	"river",
	"temple",
	"garden",
	"cathedral",
	"lighthouse",
	"bridge",
	"waterfall",
	"cavern",
	"tower",
	"meadow",
	"canyon",
	"palace",
	"monastery",
	"village",
	"archipelago",
	"glacier",
	"oasis",
];

const VERBS = [
	"emerges from",
	"stands beneath",
	"reflects in",
	"overlooks",
	"guards",
	"rests beside",
	"towers above",
	"flows through",
	"nestles within",
	"crowns",
	"embraces",
	"watches over",
	"rises from",
	"borders",
];

/**
 * Generate a random prompt from word components
 */
function generateRandomPrompt() {
	const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun1 = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
	const adjective2 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun2 = NOUNS[Math.floor(Math.random() * NOUNS.length)];

	return `${adjective} ${noun1} ${verb} ${adjective2} ${noun2}`;
}

/**
 * Make request and return relevant headers
 */
async function makeRequest(prompt) {
	const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;

	try {
		const response = await fetch(url, { method: "HEAD" });

		return {
			status: response.status,
			cacheType: response.headers.get("x-cache-type"),
			cache: response.headers.get("x-cache"),
			similarity: response.headers.get("x-semantic-best-similarity"),
			semanticSearch: response.headers.get("x-semantic-search"),
			bucket: response.headers.get("x-semantic-bucket"),
			threshold: response.headers.get("x-semantic-threshold"),
			timestamp: new Date().toISOString(),
		};
	} catch (error) {
		console.error(`❌ Request failed:`, error.message);
		return null;
	}
}

/**
 * Wait for specified milliseconds
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test semantic cache propagation timing
 */
async function testCachePropagation() {
	const originalPrompt = generateRandomPrompt();

	console.log("🧪 Testing Semantic Cache Propagation Speed\n");
	console.log(`📝 Original prompt: "${originalPrompt}"`);
	console.log(`🔍 Test strategy: Adding progressive dots (., .., ..., ....)`);
	console.log(`⏱️  Test interval: 10 seconds`);
	console.log(`🎯 Success threshold: similarity > 0.8\n`);

	// Step 1: Make initial request to trigger caching
	console.log("📤 Step 1: Making initial request to trigger caching...");
	const initialResult = await makeRequest(originalPrompt);

	if (!initialResult) {
		console.error("❌ Initial request failed. Exiting.");
		return;
	}

	console.log(`✅ Initial request completed:`);
	console.log(`   Status: ${initialResult.status}`);
	console.log(`   Cache: ${initialResult.cache || "N/A"}`);
	console.log(`   Cache Type: ${initialResult.cacheType || "N/A"}`);
	console.log(`   Time: ${initialResult.timestamp}\n`);

	// Step 2: Poll for semantic availability
	console.log("🔄 Step 2: Polling for semantic cache availability...\n");
	console.log(
		"| Attempt | Dots | Test Prompt | Time | Cache | Similarity | Semantic Search | Status |",
	);
	console.log(
		"|---------|------|-------------|------|-------|------------|-----------------|--------|",
	);

	const startTime = Date.now();
	let attempt = 1;

	while (true) {
		await sleep(10000); // Wait 10 seconds between tests

		// Add progressive dots: ., .., ..., ....
		const dots = ".".repeat(attempt);
		const testPrompt = originalPrompt + dots;

		const result = await makeRequest(testPrompt);

		if (!result) {
			console.log(
				`| ${attempt.toString().padEnd(7)} | ${dots.padEnd(4)} | ${testPrompt.substring(0, 20)}... | ${formatTime(Date.now() - startTime)} | ERROR | ERROR | ERROR | ❌ FAIL |`,
			);
			attempt++;
			continue;
		}

		const similarity = parseFloat(result.similarity) || 0;
		const timeElapsed = formatTime(Date.now() - startTime);
		const status = similarity >= 0.8 ? "🎯 SUCCESS" : "⏳ WAITING";
		const promptPreview =
			testPrompt.length > 25 ? testPrompt.substring(0, 25) + "..." : testPrompt;

		console.log(
			`| ${attempt.toString().padEnd(7)} | ${dots.padEnd(4)} | ${promptPreview.padEnd(11)} | ${timeElapsed} | ${(result.cache || "N/A").padEnd(5)} | ${(result.similarity || "N/A").padEnd(10)} | ${(result.semanticSearch || "N/A").padEnd(15)} | ${status} |`,
		);

		// Success condition: similarity > 0.8
		if (similarity >= 0.8) {
			console.log("\n🎉 SUCCESS! Semantic cache is now available!");
			console.log(`⏱️  Total propagation time: ${timeElapsed}`);
			console.log(`🔗 Similarity score: ${similarity}`);
			console.log(`📦 Bucket: ${result.bucket || "N/A"}`);
			console.log(`🎯 Threshold: ${result.threshold || "N/A"}`);
			console.log(`🔤 Final test prompt: "${testPrompt}"`);

			// Show all headers for final request
			console.log("\n📋 Final Response Headers:");
			Object.entries(result).forEach(([key, value]) => {
				if (value !== null && value !== undefined) {
					console.log(`   ${key}: ${value}`);
				}
			});

			break;
		}

		attempt++;

		// Safety check: max 30 attempts (5 minutes)
		if (attempt > 30) {
			console.log(
				"\n⏰ Timeout reached (5 minutes). Semantic cache may not be working.",
			);
			console.log(
				"💡 This could indicate an issue with vector indexing or the cache system.",
			);
			console.log(`🔤 Last test prompt: "${testPrompt}"`);
			break;
		}
	}
}

/**
 * Format elapsed time in MM:SS format
 */
function formatTime(ms) {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Run the test
console.log("🚀 Starting Semantic Cache Propagation Test...\n");
testCachePropagation().catch((error) => {
	console.error("❌ Test failed:", error);
	process.exit(1);
});
