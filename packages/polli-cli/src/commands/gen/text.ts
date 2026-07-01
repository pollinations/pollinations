import { writeFileSync } from "node:fs";
import chalk from "chalk";
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
    printWarn,
    printDebug,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";
import { streamSSE } from "../../lib/stream.js";
import { t } from "../../lib/i18n.js";
import { startSpinner, stopSpinner } from "../../lib/spinner.js";
import { TextGenOptionsSchema } from "../../lib/validation.js";
import { logActivity } from "../../lib/logger.js";
import { getDefaultModel } from "../../lib/config-store.js";
import { getCachedModels } from "../../lib/cache.js";

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
        .option("--model <model>", "Text model", getDefaultModel("text"))
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
            "Reasoning effort for reasoning models: none|minimal|low|medium|high|xhigh",
        )
        .option(
            "--image <url...>",
            "Attach image URL(s) for vision models (repeatable); local files auto-uploaded",
        )
        .option("--output <path>", "Save to file instead of stdout")
        .option(
            "--no-stream",
            "Wait for full response instead of streaming tokens",
        )
        .addHelpText("after", `
Examples:
  polli gen text "Explain quantum tunneling in one sentence"
  cat README.md | polli gen text "what does this project do?"
  polli gen text "describe this image" --image photo.jpg --model openai
  polli gen text "summarize" --model gemini --system "be concise" --output summary.txt
        `)
        .action(async (promptArg, opts) => {
            const key = await requireKey();
            const stdinText = await readStdin();
            const prompt = promptArg || stdinText;
            if (!prompt) {
                printError(t("gen.no_input", { type: "text" }));
                process.exit(1);
            }

            // Validate options
            const validation = TextGenOptionsSchema.safeParse(opts);
            if (!validation.success) {
                printError(`Invalid options: ${validation.error.message}`);
                process.exit(1);
            }
            const validOpts = validation.data;

            // Handle context from stdin
            if (promptArg && stdinText) {
                validOpts.system = validOpts.system
                    ? `${validOpts.system}\n\nContext:\n${stdinText}`
                    : stdinText;
            }

            // Handle --image: auto-upload local files
            let imageUrls: string[] = [];
            if (validOpts.image) {
                for (const url of validOpts.image) {
                    if (/^https?:\/\//i.test(url)) {
                        imageUrls.push(url);
                    } else {
                        // Local file: upload it
                        printInfo(`Uploading local file: ${url}`);
                        try {
                            const { uploadFile } = await import("../upload.js");
                            const uploaded = await uploadFile(url, key);
                            imageUrls.push(uploaded.url);
                            printInfo(`Uploaded to: ${uploaded.url}`);
                        } catch (err) {
                            printError(
                                `Failed to upload ${url}: ${err instanceof Error ? err.message : err}`,
                            );
                            process.exit(1);
                        }
                    }
                }
            }

            // Validate model supports text and possibly vision
            const models = getCachedModels<Array<{ name: string; output_modalities?: string[]; input_modalities?: string[] }>>();
            if (models && validOpts.model) {
                const found = models.find((m) => m.name === validOpts.model);
                if (!found) {
                    printWarn(`Model "${validOpts.model}" not found in cache. It may not exist.`);
                } else if (!found.output_modalities?.includes("text")) {
                    printWarn(`Model "${validOpts.model}" may not support text generation.`);
                }
                if (imageUrls.length > 0 && found && !found.input_modalities?.includes("image")) {
                    printWarn(`Model "${validOpts.model}" may not support image input (vision). The images may be ignored.`);
                }
            }

            const isHuman = getOutputMode() === "human";
            const explicitStream = validOpts.stream === true;
            const autoStream = isHuman && !!process.stdout.isTTY;
            const useStream =
                validOpts.stream !== false &&
                !validOpts.output &&
                (explicitStream || autoStream);

            type ContentPart =
                | { type: "text"; text: string }
                | { type: "image_url"; image_url: { url: string } };

            const messages: Array<{
                role: string;
                content: string | ContentPart[];
            }> = [];
            if (validOpts.system)
                messages.push({ role: "system", content: validOpts.system });

            if (imageUrls.length > 0) {
                const parts: ContentPart[] = [{ type: "text", text: prompt }];
                for (const url of imageUrls) {
                    parts.push({ type: "image_url", image_url: { url } });
                }
                messages.push({ role: "user", content: parts });
            } else {
                messages.push({ role: "user", content: prompt });
            }

            const body: Record<string, unknown> = { messages };
            if (validOpts.model) body.model = validOpts.model;
            if (validOpts.temperature !== undefined)
                body.temperature = validOpts.temperature;
            if (validOpts.maxTokens !== undefined)
                body.max_tokens = validOpts.maxTokens;
            if (validOpts.topP !== undefined) body.top_p = validOpts.topP;
            if (validOpts.frequencyPenalty !== undefined)
                body.frequency_penalty = validOpts.frequencyPenalty;
            if (validOpts.presencePenalty !== undefined)
                body.presence_penalty = validOpts.presencePenalty;
            if (validOpts.seed !== undefined) body.seed = validOpts.seed;
            if (validOpts.jsonResponse)
                body.response_format = { type: "json_object" };
            if (validOpts.reasoning) body.reasoning_effort = validOpts.reasoning;
            if (useStream) body.stream = true;

            if (isHuman && !useStream) {
                startSpinner(t("gen.generating", { type: "text" }));
            }
            printDebug(`Request body: ${JSON.stringify(body, null, 2)}`);

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
                        stopSpinner(false);
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(
                        `${res.status} ${res.statusText}: ${errText}`,
                    );
                }

                if (useStream) {
                    const colorize = process.stdout.isTTY
                        ? (s: string) => chalk.dim(s)
                        : (s: string) => s;
                    let content = "";
                    for await (const chunk of streamSSE(res)) {
                        content += chunk;
                        if (isHuman) process.stdout.write(colorize(chunk));
                    }
                    if (isHuman) process.stdout.write("\n");
                    if (getOutputMode() === "json") {
                        printResult({ content, model: validOpts.model ?? null });
                    }
                    logActivity("gen_text", {
                        prompt: prompt.slice(0, 100),
                        model: validOpts.model,
                        tokens: content.length,
                        stream: true,
                    });
                    return;
                }

                const data = (await res.json()) as ChatResponse;
                const content = data.choices[0]?.message?.content ?? "";
                if (validOpts.output) {
                    writeFileSync(validOpts.output, content, "utf-8");
                    stopSpinner(true, t("gen.saved", { path: validOpts.output }));
                } else if (getOutputMode() === "json") {
                    stopSpinner(true);
                    printResult({
                        content,
                        model: data.model,
                        tokens: data.usage?.total_tokens ?? null,
                    });
                } else {
                    stopSpinner(true);
                    const out = process.stdout.isTTY
                        ? chalk.dim(content)
                        : content;
                    process.stdout.write(`${out}\n`);
                }
                logActivity("gen_text", {
                    prompt: prompt.slice(0, 100),
                    model: validOpts.model,
                    tokens: data.usage?.total_tokens ?? content.length,
                    output: validOpts.output,
                });
            } catch (err) {
                stopSpinner(false);
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}