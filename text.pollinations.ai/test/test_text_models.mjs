#!/usr/bin/env node

// Pollinations Text Models GET Tester
// Sequentially calls the GET endpoint for each available text model
// Requires: MY_POLLINATIONS_TOKEN inside ../.env

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Determine directories
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const textServiceDir = path.resolve(__dirname, ".."); // text.pollinations.ai

// Load environment variables from text.pollinations.ai/.env
dotenv.config({ path: path.join(textServiceDir, ".env") });

const token = process.env.MY_POLLINATIONS_TOKEN;
if (!token) {
	console.error(
		"❌  MY_POLLINATIONS_TOKEN not found in .env file (text.pollinations.ai/.env)",
	);
	process.exit(1);
}

// --- Configure base URL ---
const API_BASE = process.env.TEXT_API_BASE || "http://localhost:16385";

const PROMPT = "Do I work, let's try";

// Polyfill fetch for Node < 18
let fetchFn = globalThis.fetch;
if (!fetchFn) {
	try {
		fetchFn = (await import("node-fetch")).default;
	} catch {
		console.error(
			"❌  fetch not available. Please use Node >=18 or install node-fetch",
		);
		process.exit(1);
	}
}

// --- Retrieve available models from local server ---
let textModels = [];
try {
	const modelsRes = await fetchFn(`${API_BASE}/models`);
	const modelsData = await modelsRes.json();

	if (Array.isArray(modelsData)) {
		textModels = modelsData;
	} else if (modelsData && typeof modelsData === "object") {
		// Some deployments may return an object, e.g. { models: [ ... ] } or keyed by id
		if (Array.isArray(modelsData.models)) {
			textModels = modelsData.models;
		} else {
			textModels = Object.keys(modelsData);
		}
	}
} catch (err) {
	console.error(
		`Failed to fetch model list from ${API_BASE}/models - ${err.message}`,
	);
	process.exit(1);
}

if (textModels.length === 0) {
	console.error("No models retrieved – aborting.");
	process.exit(1);
}

const results = [];

for (const modelName of textModels) {
	const model =
		typeof modelName === "string"
			? modelName
			: modelName.id || modelName.name || "unknown";
	const url = `${API_BASE}/${encodeURIComponent(PROMPT)}?model=${model}&token=${encodeURIComponent(token)}`;
	console.log(`\nGET ${url}`);
	const start = Date.now();

	try {
		const response = await fetchFn(url);
		const elapsed = Date.now() - start;
		const body = await response.text();

		if (response.ok) {
			console.log(`✅  [${model}] ${response.status} (${elapsed} ms)`);
			results.push({
				model: model,
				status: "success",
				statusCode: response.status,
				time: elapsed,
			});
		} else {
			console.error(
				`❌  [${model}] ${response.status} - ${body.slice(0, 120)}...`,
			);
			results.push({
				model: model,
				status: "http_error",
				statusCode: response.status,
				message: body,
			});
		}
	} catch (err) {
		console.error(`⚠️  [${model}] Request failed - ${err.message}`);
		results.push({ model: model, status: "network_error", error: err.message });
	}
}

// Summary report
console.log("\n=== Test Summary ===");
for (const r of results) {
	switch (r.status) {
		case "success":
			console.log(`✅ ${r.model} - OK (${r.time} ms)`);
			break;
		case "http_error":
			console.log(`❌ ${r.model} - HTTP ${r.statusCode}`);
			break;
		case "network_error":
			console.log(`⚠️  ${r.model} - Network error: ${r.error}`);
			break;
	}
}
