import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";
import { streamSSE } from "../../lib/stream.js";

interface ChatResponse {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { total_tokens: number };
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
        .option("--json-response", "Force model to return JSON object")
        .option(
            "--reasoning <effort>",
            "Reasoning effort for reasoning models: low|medium|high",
        )
        .option(
            "--image <url...>",
            "Attach image URL(s) for vision models (repeatable)",
        )
        .option("--output <path>", "Save to file instead of stdout")
        .option("--stream", "Stream tokens as they arrive (interactive use)")
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
            const useStream = Boolean(opts.stream) && !opts.output && isHuman;

            type ContentPart =
                | { type: "text"; text: string }
                | { type: "image_url"; image_url: { url: string } };
            const messages: Array<{
                role: string;
                content: string | ContentPart[];
            }> = [];
            if (opts.system)
                messages.push({ role: "system", content: opts.system });

            const images: string[] = Array.isArray(opts.image)
                ? opts.image
                : [];
            if (images.length > 0) {
                const parts: ContentPart[] = [{ type: "text", text: prompt }];
                for (const url of images) {
                    parts.push({ type: "image_url", image_url: { url } });
                }
                messages.push({ role: "user", content: parts });
            } else {
                messages.push({ role: "user", content: prompt });
            }

            const body: Record<string, unknown> = { messages };
            if (opts.model) body.model = opts.model;
            if (opts.temperature !== undefined)
                body.temperature = Number(opts.temperature);
            if (opts.maxTokens !== undefined)
                body.max_tokens = Number(opts.maxTokens);
            if (opts.topP !== undefined) body.top_p = Number(opts.topP);
            if (opts.frequencyPenalty !== undefined)
                body.frequency_penalty = Number(opts.frequencyPenalty);
            if (opts.presencePenalty !== undefined)
                body.presence_penalty = Number(opts.presencePenalty);
            if (opts.seed !== undefined) body.seed = Number(opts.seed);
            if (opts.jsonResponse)
                body.response_format = { type: "json_object" };
            if (opts.reasoning) body.reasoning_effort = opts.reasoning;
            if (useStream) body.stream = true;

            if (isHuman && !useStream) printInfo("Generating...");

            try {
                const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${key}`,
                    },
                    body: JSON.stringify(body),
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, errText);
                    if (hint) {
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(
                        `${res.status} ${res.statusText}: ${errText}`,
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
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
