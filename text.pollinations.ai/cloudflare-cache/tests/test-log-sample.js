import fetch from "node-fetch";
import fs from "fs";

const CACHE_URL = "http://localhost:8888";
const LOG_FILE = "/Users/thomash/Downloads/thespecificdev.log";

console.log("🎮 Sample Log Conversation Semantic Cache Test");
console.log(
	"Testing random subset of 10 conversations to see semantic matches in detail\n",
);

// Parse log file and extract ALL conversation requests, then take random subset
function parseLogFile(filePath) {
	try {
		const logContent = fs.readFileSync(filePath, "utf8");
		const lines = logContent.split("\n").filter((line) => line.trim());

		const conversations = [];

		for (const line of lines) {
			try {
				const jsonStart = line.indexOf('{"timestamp"');
				if (jsonStart === -1) continue;

				const logEntry = JSON.parse(line.substring(jsonStart));

				if (logEntry.request && logEntry.request.messages) {
					conversations.push({
						timestamp: logEntry.timestamp,
						username: logEntry.username,
						model: logEntry.request.model,
						messages: logEntry.request.messages,
						temperature: logEntry.request.temperature,
						originalResponse: logEntry.response,
					});
				}
			} catch (parseError) {
				continue;
			}
		}

		return conversations;
	} catch (error) {
		console.error("Error reading log file:", error.message);
		return [];
	}
}

// Get random subset of conversations
function getRandomSubset(conversations, count = 10) {
	const shuffled = [...conversations].sort(() => 0.5 - Math.random());
	return shuffled.slice(0, count);
}

// Map premium models to free tier equivalents
function mapToFreeTierModel(model) {
	const modelMap = {
		"openai-roblox": "openai",
		"gpt-4": "openai",
		"gpt-4o": "openai",
		"claude-3": "qwen-coder",
		"mistral-large": "qwen-coder",
	};
	return modelMap[model] || model;
}

async function makeRequest(conversation, baseUrl = CACHE_URL) {
	const mappedModel = mapToFreeTierModel(conversation.model);

	const requestBody = {
		model: mappedModel,
		messages: conversation.messages,
		temperature: conversation.temperature || 0.3,
		stream: false,
	};

	const startTime = Date.now();

	try {
		const response = await fetch(`${baseUrl}/openai/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		const endTime = Date.now();
		const responseTime = endTime - startTime;

		const data = await response.text();

		// Extract cache headers
		const cacheType = response.headers.get("x-cache-type") || "unknown";
		const semanticSimilarity = response.headers.get("x-semantic-similarity");
		const cacheModel = response.headers.get("x-cache-model");

		return {
			status: response.status,
			responseTime,
			cacheType,
			semanticSimilarity: semanticSimilarity
				? parseFloat(semanticSimilarity)
				: null,
			cacheModel,
			fullResponse: data,
			mappedModel,
		};
	} catch (error) {
		return {
			status: "ERROR",
			responseTime: Date.now() - startTime,
			error: error.message,
			cacheType: "error",
		};
	}
}

async function runSampleTest() {
	console.log("📖 Parsing ALL conversations from log file...");
	const allConversations = parseLogFile(LOG_FILE);

	if (allConversations.length === 0) {
		console.log("❌ No conversations found in log file");
		return;
	}

	console.log(`✅ Found ${allConversations.length} total conversations`);

	// Take random subset to avoid testing already cached conversations
	const conversations = getRandomSubset(allConversations, 10);
	console.log(
		`🎲 Selected random subset of ${conversations.length} conversations for testing`,
	);
	console.log("🧪 Testing semantic caching with detailed output\n");
	console.log("=".repeat(80));

	let semanticHits = 0;

	for (let i = 0; i < conversations.length; i++) {
		const conversation = conversations[i];

		console.log(
			`\n${i + 1}/${conversations.length}. ${conversation.username} - ${conversation.model} → ${mapToFreeTierModel(conversation.model)}`,
		);
		console.log(`Timestamp: ${conversation.timestamp}`);
		console.log("-".repeat(50));

		const result = await makeRequest(conversation);

		if (result.status === "ERROR") {
			console.log(`❌ Error: ${result.error}`);
			continue;
		}

		console.log(
			`Status: ${result.status} | Time: ${result.responseTime}ms | Cache: ${result.cacheType}`,
		);

		if (result.semanticSimilarity !== null) {
			console.log(`Similarity: ${result.semanticSimilarity.toFixed(6)}`);
		}

		// Show detailed info for semantic hits
		if (result.cacheType === "semantic") {
			semanticHits++;
			console.log("🔍 SEMANTIC CACHE HIT - DETAILED ANALYSIS");

			// Show conversation context
			console.log("\n📝 CONVERSATION CONTEXT:");
			const nonSystemMessages = conversation.messages.filter(
				(m) => m.role !== "system",
			);
			const lastTwoMessages = nonSystemMessages.slice(-2);

			lastTwoMessages.forEach((msg, idx) => {
				const role = msg.role === "user" ? "👤 User" : "🤖 Assistant";
				const content =
					msg.content.length > 200
						? msg.content.substring(0, 200) + "..."
						: msg.content;
				console.log(`  ${role}: "${content}"`);
			});

			// Show cached response
			console.log("\n💾 CACHED RESPONSE:");
			try {
				const responseData = JSON.parse(result.fullResponse);
				if (
					responseData.choices &&
					responseData.choices[0] &&
					responseData.choices[0].message
				) {
					const cachedContent = responseData.choices[0].message.content;
					console.log(`  🤖 Cached: "${cachedContent}"`);
				} else {
					console.log(`  📄 Raw: ${result.fullResponse.substring(0, 500)}...`);
				}
			} catch (e) {
				console.log(`  📄 Raw: ${result.fullResponse.substring(0, 500)}...`);
			}

			console.log("\n" + "=".repeat(60));
		}

		// Small delay
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	console.log(
		`\n🎯 Found ${semanticHits} semantic cache hits in first ${conversations.length} conversations`,
	);
	console.log("🎉 Sample test completed!");
}

// Run the test
runSampleTest().catch(console.error);
