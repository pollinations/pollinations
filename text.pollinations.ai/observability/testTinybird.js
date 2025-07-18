#!/usr/bin/env node

import { sendTinybirdEvent } from "./tinybirdTracker.js";
import crypto from "crypto";

/**
 * CLI to test sending events to Tinybird
 * @param {Object} options - Options for the test event
 */
async function main() {
	const args = process.argv.slice(2);
	const command = args[0] || "send";

	switch (command) {
		case "send":
			await sendTestEvent();
			break;
		case "send-success":
			await sendSuccessEvent();
			break;
		case "send-error":
			await sendErrorEvent();
			break;
		case "send-batch":
			const count = parseInt(args[1]) || 5;
			await sendBatchEvents(count);
			break;
		default:
			console.log("Unknown command:", command);
			console.log("Available commands:");
			console.log("  send - Send a basic test event");
			console.log("  send-success - Send a successful completion event");
			console.log("  send-error - Send an error event");
			console.log(
				"  send-batch [count] - Send multiple test events (default: 5)",
			);
			process.exit(1);
	}

	console.log("Test completed");
}

async function sendTestEvent() {
	const startTime = new Date(Date.now() - 1000); // 1 second ago
	const endTime = new Date();
	const requestId = crypto.randomUUID();

	await sendTinybirdEvent({
		startTime,
		endTime,
		requestId,
		model: "gpt-4-turbo",
		provider: "openai",
		duration: endTime - startTime,
		status: "success",
		promptTokens: 150,
		completionTokens: 50,
		content: "This is a test response",
		messages: [
			{ role: "system", content: "You are a helpful assistant." },
			{ role: "user", content: "Hello, this is a test prompt!" },
		],
		organization: "pollinations",
		project: "text.pollinations.ai",
		environment: "testing",
		chatId: "test-chat-id",
		user: "test-user",
	});

	console.log("Sent test event with ID:", requestId);
}

async function sendSuccessEvent() {
	const startTime = new Date(Date.now() - 2500); // 2.5 seconds ago
	const endTime = new Date();
	const requestId = crypto.randomUUID();

	await sendTinybirdEvent({
		startTime,
		endTime,
		requestId,
		model: "gpt-4-1106-preview",
		provider: "azure-openai",
		duration: endTime - startTime,
		status: "success",
		promptTokens: 320,
		completionTokens: 125,
		content:
			"This is a detailed response to the user query about machine learning techniques for natural language processing.",
		messages: [
			{
				role: "system",
				content: "You are an AI expert specialized in machine learning.",
			},
			{
				role: "user",
				content:
					"Can you explain the most effective ML techniques for NLP tasks?",
			},
		],
		organization: "pollinations",
		project: "text.pollinations.ai",
		environment: "testing",
		chatId: "success-test-chat",
		user: "test-researcher",
	});

	console.log("Sent success event with ID:", requestId);
}

async function sendErrorEvent() {
	const startTime = new Date(Date.now() - 800); // 0.8 seconds ago
	const endTime = new Date();
	const requestId = crypto.randomUUID();
	const error = new Error("Rate limit exceeded");
	error.stack =
		"Error: Rate limit exceeded\n    at processRequest (openaiClient.js:125)\n    at async generateResponse (textGenerator.js:87)";

	await sendTinybirdEvent({
		startTime,
		endTime,
		requestId,
		model: "mistral-small-latest",
		provider: "mistral",
		duration: endTime - startTime,
		status: "error",
		error,
		messages: [
			{
				role: "user",
				content: "Generate a very long response about quantum computing",
			},
		],
		organization: "pollinations",
		project: "text.pollinations.ai",
		environment: "testing",
		chatId: "error-test-chat",
		user: "test-heavy-user",
	});

	console.log("Sent error event with ID:", requestId);
}

async function sendBatchEvents(count) {
	console.log(`Sending batch of ${count} test events...`);

	const providers = [
		"openai",
		"azure-openai",
		"anthropic",
		"mistral",
		"google",
	];
	const models = [
		"gpt-4-turbo",
		"claude-3-opus",
		"gpt-3.5-turbo",
		"mistral-large",
		"gemini-pro",
	];
	const users = ["user-1", "user-2", "user-3", "user-4", "user-5"];
	const statuses = ["success", "success", "success", "success", "error"]; // 80% success rate

	for (let i = 0; i < count; i++) {
		const provider = providers[Math.floor(Math.random() * providers.length)];
		const model = models[Math.floor(Math.random() * models.length)];
		const user = users[Math.floor(Math.random() * users.length)];
		const status = statuses[Math.floor(Math.random() * statuses.length)];
		const duration = Math.floor(Math.random() * 3000) + 500; // 500-3500ms

		const startTime = new Date(Date.now() - duration);
		const endTime = new Date();
		const requestId = crypto.randomUUID();

		const promptTokens = Math.floor(Math.random() * 500) + 50;
		const completionTokens =
			status === "success" ? Math.floor(Math.random() * 300) + 20 : 0;

		await sendTinybirdEvent({
			startTime,
			endTime,
			requestId,
			model,
			provider,
			duration,
			status,
			promptTokens,
			completionTokens,
			content:
				status === "success" ? `This is test response ${i + 1}` : undefined,
			messages: [{ role: "user", content: `This is test prompt ${i + 1}` }],
			organization: "pollinations",
			project: "text.pollinations.ai",
			environment: "testing",
			chatId: `batch-test-${i}`,
			user,
			...(status === "error"
				? {
						error: new Error("Random test error"),
					}
				: {}),
		});

		console.log(`Sent event ${i + 1}/${count}: ${status} ${provider} ${model}`);

		// Small delay to avoid overwhelming the API
		if (i < count - 1) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
}

// Run the main function
main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
