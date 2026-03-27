import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { BASE_URL, resolveModel } from "../lib/config.js";
import { requireKey } from "../lib/api.js";
import {
	getOutputMode,
	printError,
	printResult,
	printSuccess,
} from "../lib/output.js";

interface ChatResponse {
	choices: Array<{ message: { content: string } }>;
	model: string;
	usage?: { total_tokens: number };
}

async function generateOne(
	key: string,
	prompt: string,
	opts: {
		model: string;
		system?: string;
		temperature?: string;
		maxTokens?: string;
		topP?: string;
		frequencyPenalty?: string;
		presencePenalty?: string;
		seed?: string;
		json?: boolean;
		thinking?: boolean;
	},
): Promise<ChatResponse> {
	const messages = [];
	if (opts.system) messages.push({ role: "system", content: opts.system });
	messages.push({ role: "user", content: prompt });

	const body: Record<string, unknown> = { model: opts.model, messages };
	if (opts.temperature) body.temperature = Number(opts.temperature);
	if (opts.maxTokens) body.max_tokens = Number(opts.maxTokens);
	if (opts.topP) body.top_p = Number(opts.topP);
	if (opts.frequencyPenalty) body.frequency_penalty = Number(opts.frequencyPenalty);
	if (opts.presencePenalty) body.presence_penalty = Number(opts.presencePenalty);
	if (opts.seed) body.seed = Number(opts.seed);
	if (opts.json) body.response_format = { type: "json_object" };
	if (opts.thinking) body.thinking = true;

	const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(120_000),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`${res.status} ${res.statusText}: ${text}`);
	}

	return res.json() as Promise<ChatResponse>;
}

export const textCommand = new Command("text")
	.description("Generate text from a prompt")
	.argument("<prompt>", "Text prompt")
	.option("--model <model>", "Text model (default: from config or 'openai')")
	.option("--system <msg>", "System message")
	.option("--temperature <n>", "Randomness (0-2)")
	.option("--max-tokens <n>", "Maximum output tokens")
	.option("--top-p <n>", "Nucleus sampling (0-1)")
	.option("--frequency-penalty <n>", "Repetition penalty (-2 to 2)")
	.option("--presence-penalty <n>", "Topic penalty (-2 to 2)")
	.option("--seed <n>", "Reproducibility seed")
	.option("--json", "Force JSON output")
	.option("--thinking", "Enable extended thinking (reasoning models)")
	.option("--count <n>", "Generate multiple responses", "1")
	.option("--output <path>", "Save to file instead of stdout")
	.action(async (prompt, opts) => {
		const key = requireKey();
		opts.model = resolveModel("text", opts.model);
		const isHuman = getOutputMode() === "human";
		const count = Math.max(1, Number.parseInt(opts.count, 10) || 1);

		const spinner = isHuman
			? ora(count > 1 ? `Generating ${count} responses...` : "Generating...").start()
			: null;

		try {
			const results = await Promise.all(
				Array.from({ length: count }, () => generateOne(key, prompt, opts)),
			);

			spinner?.stop();

			if (count === 1) {
				const data = results[0];
				const content = data.choices[0]?.message?.content ?? "";

				if (opts.output) {
					writeFileSync(opts.output, content, "utf-8");
					printSuccess(`Saved to ${opts.output}`);
				} else if (getOutputMode() === "json") {
					printResult({
						content,
						model: data.model,
						tokens: data.usage?.total_tokens ?? null,
					});
				} else {
					process.stdout.write(`${content}\n`);
				}
			} else {
				const items = results.map((data, i) => ({
					index: i + 1,
					content: data.choices[0]?.message?.content ?? "",
					model: data.model,
					tokens: data.usage?.total_tokens ?? null,
				}));

				if (opts.output) {
					writeFileSync(opts.output, JSON.stringify(items, null, 2), "utf-8");
					printSuccess(`Saved ${count} responses to ${opts.output}`);
				} else if (getOutputMode() === "json") {
					printResult(items);
				} else {
					for (const item of items) {
						process.stdout.write(`--- Response ${item.index} ---\n${item.content}\n\n`);
					}
				}
			}
		} catch (err) {
			spinner?.fail("Generation failed");
			printError(err instanceof Error ? err.message : "unknown error");
			process.exit(1);
		}
	});
