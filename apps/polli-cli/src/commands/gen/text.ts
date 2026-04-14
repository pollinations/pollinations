import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import {
    getOutputMode,
    printError,
    printResult,
    printSuccess,
} from "../../lib/output.js";
import { streamSSE } from "../../lib/stream.js";

interface ChatResponse {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { total_tokens: number };
}

async function readStdin(): Promise<string> {
    if (process.stdin.isTTY) return "";
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
}

export function createTextCommand() {
    return new Command("text")
        .description(
            "Generate text from a prompt (also reads stdin: echo 'hello' | polli text)",
        )
        .argument("[prompt]", "Text prompt (or pipe via stdin)")
        .option("--model <model>", "Text model")
        .option("--system <msg>", "System message")
        .option("--temperature <n>", "Randomness (0-2)")
        .option("--max-tokens <n>", "Maximum output tokens")
        .option("--top-p <n>", "Nucleus sampling (0-1)")
        .option("--frequency-penalty <n>", "Repetition penalty (-2 to 2)")
        .option("--presence-penalty <n>", "Topic penalty (-2 to 2)")
        .option("--seed <n>", "Reproducibility seed")
        .option("--json", "Force JSON output")
        .option("--thinking", "Enable extended thinking (reasoning models)")
        .option("--output <path>", "Save to file instead of stdout")
        .option("--no-stream", "Disable streaming (wait for full response)")
        .action(async (promptArg, opts) => {
            const key = requireKey();
            const stdinText = await readStdin();
            const prompt = promptArg || stdinText;

            if (!prompt) {
                printError(
                    "No prompt provided. Pass as argument or pipe via stdin.",
                );
                process.exit(1);
            }

            // If both stdin and arg are provided, use arg as prompt and stdin as context
            if (promptArg && stdinText) {
                opts.system = opts.system
                    ? `${opts.system}\n\nContext:\n${stdinText}`
                    : stdinText;
            }

            const isHuman = getOutputMode() === "human";
            const useStream = opts.stream !== false && !opts.output;

            const messages: Array<{ role: string; content: string }> = [];
            if (opts.system)
                messages.push({ role: "system", content: opts.system });
            messages.push({ role: "user", content: prompt });

            const body: Record<string, unknown> = { messages };
            if (opts.model) body.model = opts.model;
            if (opts.temperature) body.temperature = Number(opts.temperature);
            if (opts.maxTokens) body.max_tokens = Number(opts.maxTokens);
            if (opts.topP) body.top_p = Number(opts.topP);
            if (opts.frequencyPenalty)
                body.frequency_penalty = Number(opts.frequencyPenalty);
            if (opts.presencePenalty)
                body.presence_penalty = Number(opts.presencePenalty);
            if (opts.seed) body.seed = Number(opts.seed);
            if (opts.json) body.response_format = { type: "json_object" };
            if (opts.thinking) body.thinking = true;
            if (useStream) body.stream = true;

            const spinner =
                isHuman && !useStream ? ora("Generating...").start() : null;

            try {
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
                    throw new Error(
                        `${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`,
                    );
                }

                if (useStream) {
                    let content = "";
                    for await (const chunk of streamSSE(res)) {
                        content += chunk;
                        if (isHuman) process.stdout.write(chunk);
                    }
                    if (isHuman) process.stdout.write("\n");
                    if (getOutputMode() === "json") {
                        printResult({ content, model: opts.model ?? null });
                    }
                    return;
                }

                const data = (await res.json()) as ChatResponse;
                const content = data.choices[0]?.message?.content ?? "";
                spinner?.stop();

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
            } catch (err) {
                spinner?.stop();
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
