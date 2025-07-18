/**
 * Live Vectorize Testing Script
 * Tests the semantic cache with real Vectorize during local development
 */

async function testLiveVectorize() {
	const baseUrl = "http://localhost:8787"; // wrangler dev default port

	console.log("🧪 Testing Live Vectorize Integration\n");
	console.log(
		'Make sure to run "wrangler dev --env test" in another terminal first!\n',
	);

	try {
		// Test 1: First request (should be cache miss)
		console.log("📝 Test 1: Initial request (cache miss expected)");
		console.log('   Request: "a cat" (512x512)');

		const response1 = await fetch(
			`${baseUrl}/prompt/a+cat?width=512&height=512`,
		);

		if (response1.status !== 200) {
			console.log(`   ❌ Status: ${response1.status}`);
			console.log("   First request failed - check server logs for details");
			return;
		}

		const cacheType1 = response1.headers.get("x-cache") || "unknown";

		console.log(`   ✅ Status: ${response1.status}`);
		console.log(`   📊 Cache: ${cacheType1}`);
		console.log(`   🔄 Should be: MISS (new image generated)\n`);

		// Wait for async embedding storage
		console.log("⏳ Waiting 3 seconds for embedding to be stored...\n");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Test 2: Similar request (should hit semantic cache)
		console.log("📝 Test 2: Semantically similar request");
		console.log('   Request: "a kitten" (512x512)');

		const response2 = await fetch(
			`${baseUrl}/prompt/a+kitten?width=512&height=512`,
		);
		const cacheType2 = response2.headers.get("x-cache") || "unknown";
		const cacheTypeDetailed2 =
			response2.headers.get("x-cache-type") || "unknown";
		const similarity2 = response2.headers.get("x-semantic-similarity");

		console.log(`   ✅ Status: ${response2.status}`);
		console.log(`   📊 Cache: ${cacheType2}`);
		console.log(`   📊 Cache Type: ${cacheTypeDetailed2}`);
		console.log(`   🎯 Similarity: ${similarity2 || "not provided"}`);
		console.log(`   🔄 Should be: HIT (semantic) if similarity > 0.85\n`);

		// Test 3: Different resolution (should miss due to bucket isolation)
		console.log("📝 Test 3: Same prompt, different resolution");
		console.log('   Request: "a cat" (256x256)');

		const response3 = await fetch(
			`${baseUrl}/prompt/a+cat?width=256&height=256`,
		);
		const cacheType3 = response3.headers.get("x-cache") || "unknown";

		console.log(`   ✅ Status: ${response3.status}`);
		console.log(`   📊 Cache: ${cacheType3}`);
		console.log(`   🔄 Should be: MISS (different resolution bucket)\n`);

		// Test 4: Exact same request (should hit exact cache)
		console.log("📝 Test 4: Exact same request");
		console.log('   Request: "a cat" (512x512)');

		const response4 = await fetch(
			`${baseUrl}/prompt/a+cat?width=512&height=512`,
		);
		const cacheType4 = response4.headers.get("x-cache") || "unknown";

		console.log(`   ✅ Status: ${response4.status}`);
		console.log(`   📊 Cache: ${cacheType4}`);
		console.log(`   🔄 Should be: HIT (exact)\n`);

		// Summary
		console.log("📊 Test Summary:");
		console.log(`   Test 1 (new request): ${cacheType1}`);
		console.log(
			`   Test 2 (similar prompt): ${cacheType2} ${similarity2 ? `(${similarity2})` : ""}`,
		);
		console.log(`   Test 3 (diff resolution): ${cacheType3}`);
		console.log(`   Test 4 (exact match): ${cacheType4}`);

		console.log("\n🎉 Live Vectorize testing completed!");
		console.log(
			"Check the wrangler dev console for detailed semantic cache logs.",
		);
	} catch (error) {
		console.error("❌ Test failed:", error.message);
		console.log("\n🔧 Troubleshooting:");
		console.log('   1. Make sure "wrangler dev --env test" is running');
		console.log(
			'   2. Check if Vectorize index "pollinations-image-cache-test" exists',
		);
		console.log("   3. Verify AI binding is configured");
		console.log("   4. Check network connectivity");
	}
}

// Run the test
testLiveVectorize();
