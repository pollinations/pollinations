import { Command } from "commander";
import { requireKey } from "../lib/api.js";
import { BASE_URL, resolveModel } from "../lib/config.js";
import { getOutputMode, printError, printResult } from "../lib/output.js";

/**
 * `polli pipe` — reads stdin and sends it as a prompt to the text API.
 * Perfect for piping data through Pollinations:
 *
 *   cat error.log | polli pipe --system "explain this error"
 *   git diff | polli pipe --system "review this diff"
 *   echo "translate to spanish: hello world" | polli pipe
 */
export const pipeCommand = new Command("pipe")
    .description("Pipe stdin through text generation")
    .option("--model <model>", "Text model (default: from config or 'openai')")
    .option("--system <msg>", "System message (context for the input)")
    .option("--temperature <n>", "Randomness (0-2)")
    .option("--max-tokens <n>", "Maximum output tokens")
    .action(async (opts) => {
        const key = requireKey();
        opts.model = resolveModel("text", opts.model);

        // Read all of stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
        }
        const input = Buffer.concat(chunks).toString("utf-8").trim();

        if (!input) {
            printError("No input received on stdin");
            process.exit(1);
        }

        const messages = [];
        if (opts.system) {
            messages.push({ role: "system", content: opts.system });
        }
        messages.push({ role: "user", content: input });

        const body: Record<string, unknown> = { model: opts.model, messages };
        if (opts.temperature) body.temperature = Number(opts.temperature);
        if (opts.maxTokens) body.max_tokens = Number(opts.maxTokens);

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
                const text = await res.text().catch(() => "");
                throw new Error(`${res.status}: ${text}`);
            }

            const data = (await res.json()) as {
                choices: Array<{ message: { content: string } }>;
                model: string;
                usage?: { total_tokens: number };
            };

            const content = data.choices[0]?.message?.content ?? "";

            if (getOutputMode() === "json") {
                printResult({
                    content,
                    model: data.model,
                    tokens: data.usage?.total_tokens ?? null,
                });
            } else {
                process.stdout.write(`${content}\n`);
            }
        } catch (err) {
            printError(err instanceof Error ? err.message : "unknown error");
            process.exit(1);
        }
    });
