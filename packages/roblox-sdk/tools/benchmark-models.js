#!/usr/bin/env node
// Benchmarks candidate models on the same set of NPC prompts: latency, token
// usage, and raw output for manual roleplay-quality comparison. Requires
// Node 18+ (uses the built-in fetch).
//
// Usage:
//   POLLINATIONS_API_KEY=pk_... node benchmark-models.js \
//     --prompts prompts.json --models openai,your-username/npc-mini --out report.json
//
// prompts.json: ["Can I have a sword?", "Where's the well?", "I want to trade."]

const fs = require("fs");

const API_URL = "https://gen.pollinations.ai/v1/chat/completions";
const SYSTEM_PROMPT = "You are Grix, a grumpy but helpful blacksmith NPC.";

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i].replace(/^--/, "");
		args[key] = argv[i + 1];
	}
	return args;
}

async function callModel(model, prompt, apiKey) {
	const start = Date.now();
	const res = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: prompt },
			],
		}),
	});
	const latencyMs = Date.now() - start;
	const data = await res.json();

	return {
		model,
		prompt,
		latencyMs,
		reply: data.choices && data.choices[0] ? data.choices[0].message.content : null,
		usage: data.usage || null,
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const apiKey = process.env.POLLINATIONS_API_KEY;

	if (!apiKey || !args.prompts || !args.models || !args.out) {
		console.error(
			"Usage: POLLINATIONS_API_KEY=pk_... node benchmark-models.js --prompts <prompts.json> --models <a,b,c> --out <report.json>",
		);
		process.exit(1);
	}

	const prompts = JSON.parse(fs.readFileSync(args.prompts, "utf8"));
	const models = args.models.split(",");

	const results = [];
	for (const model of models) {
		for (const prompt of prompts) {
			const result = await callModel(model, prompt, apiKey);
			results.push(result);
			console.log(`[${model}] ${result.latencyMs}ms — ${prompt}`);
		}
	}

	fs.writeFileSync(args.out, JSON.stringify(results, null, 2));

	console.log("\n--- Summary (avg latency, avg total tokens) ---");
	for (const model of models) {
		const rows = results.filter((r) => r.model === model);
		const avgLatency = rows.reduce((sum, r) => sum + r.latencyMs, 0) / rows.length;
		const avgTokens = rows.reduce((sum, r) => sum + (r.usage ? r.usage.total_tokens || 0 : 0), 0) / rows.length;
		console.log(`${model}: ${avgLatency.toFixed(0)}ms avg, ${avgTokens.toFixed(0)} tokens avg`);
	}

	console.log(`\nFull report written to ${args.out}. Read replies side by side to judge roleplay quality.`);
}

main();
