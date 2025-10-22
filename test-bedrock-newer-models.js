#!/usr/bin/env node

/**
 * Test newer Bedrock Claude models that require AWS Marketplace permissions
 */

import fetch from "node-fetch";

const FARGATE_ENDPOINT = "http://bedroc-Proxy-He0yOirTrdQe-378478291.us-east-1.elb.amazonaws.com/api/v1";
const API_KEY = process.env.AWS_BEARER_TOKEN_BEDROCK_FARGATE;

if (!API_KEY) {
	console.error("❌ Error: AWS_BEARER_TOKEN_BEDROCK_FARGATE environment variable not set");
	process.exit(1);
}

const MODELS = [
	"us.anthropic.claude-sonnet-4-5-20250929-v1:0",
	"us.anthropic.claude-opus-4-20250514-v1:0",
	"us.anthropic.claude-haiku-4-5-20251001-v1:0",
];

async function testModel(modelId) {
	try {
		const response = await fetch(`${FARGATE_ENDPOINT}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${API_KEY}`,
			},
			body: JSON.stringify({
				model: modelId,
				messages: [{ role: "user", content: "Say 'Hello' in one word." }],
				max_tokens: 10,
			}),
		});

		const data = await response.json();

		if (response.ok) {
			console.log(`✅ ${modelId}`);
			console.log(`   Response: ${data.choices?.[0]?.message?.content}`);
			return true;
		} else if (response.status === 403 || response.status === 401) {
			console.log(`❌ ${modelId}`);
			console.log(`   Error: Access denied - needs AWS Marketplace subscription`);
			console.log(`   Details: ${data.error?.message}`);
			return false;
		} else {
			console.log(`⚠️ ${modelId}`);
			console.log(`   Error: ${data.error?.message || `HTTP ${response.status}`}`);
			return false;
		}
	} catch (error) {
		console.log(`❌ ${modelId}`);
		console.log(`   Network error: ${error.message}`);
		return false;
	}
}

async function main() {
	console.log("🧪 Testing Newer Claude Models\n");
	for (const model of MODELS) {
		await testModel(model);
		console.log();
	}
}

main();
