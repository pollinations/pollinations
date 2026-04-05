import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import chalk from "chalk";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { getOutputMode, printError, printResult } from "../../lib/output.js";

interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

interface ChatResponse {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export function createChatCommand() {
    return new Command("chat")
        .description("Interactive multi-turn chat session")
        .option(
            "--model <model>",
            "Text model (default: from config or 'openai')",
        )
        .option("--system <msg>", "System message")
        .option("--temperature <n>", "Randomness (0-2)")
        .option("--max-tokens <n>", "Maximum output tokens")
        .option("--save <path>", "Save conversation transcript on exit")
        .action(async (opts) => {
            const key = requireKey();
            const isJson = getOutputMode() !== "human";

            const messages: Message[] = [];
            if (opts.system) {
                messages.push({ role: "system", content: opts.system });
            }

            let totalTokens = 0;

            if (!isJson) {
                process.stderr.write(
                    chalk.green(
                        `\nChat session started (model: ${opts.model})\n`,
                    ) +
                        chalk.dim(
                            "Type /exit to quit, /clear to reset, /save <path> to save\n\n",
                        ),
                );
            }

            const rl = createInterface({
                input: process.stdin,
                output: process.stderr,
                prompt: isJson ? "" : chalk.cyan("you > "),
            });

            const sendMessage = async (userMsg: string) => {
                messages.push({ role: "user", content: userMsg });

                try {
                    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${key}`,
                        },
                        body: JSON.stringify({
                            model: opts.model,
                            messages,
                            ...(opts.temperature && {
                                temperature: Number(opts.temperature),
                            }),
                            ...(opts.maxTokens && {
                                max_tokens: Number(opts.maxTokens),
                            }),
                        }),
                        signal: AbortSignal.timeout(120_000),
                    });

                    if (!res.ok) {
                        const text = await res.text().catch(() => "");
                        throw new Error(`${res.status}: ${text}`);
                    }

                    const data = (await res.json()) as ChatResponse;
                    const content = data.choices[0]?.message?.content ?? "";
                    messages.push({ role: "assistant", content });

                    if (data.usage) totalTokens += data.usage.total_tokens;

                    if (isJson) {
                        printResult({
                            role: "assistant",
                            content,
                            model: data.model,
                            tokens: data.usage?.total_tokens,
                        });
                    } else {
                        process.stderr.write(
                            `${chalk.yellow("ai")} > ${content}\n\n`,
                        );
                    }
                } catch (err) {
                    // Remove the failed user message
                    messages.pop();
                    printError(
                        err instanceof Error ? err.message : "Request failed",
                    );
                }
            };

            const saveTranscript = (path: string) => {
                const transcript = messages
                    .filter((m) => m.role !== "system")
                    .map(
                        (m) =>
                            `${m.role === "user" ? "You" : "AI"}: ${m.content}`,
                    )
                    .join("\n\n");
                writeFileSync(path, transcript, "utf-8");
                if (!isJson) {
                    process.stderr.write(chalk.green(`Saved to ${path}\n`));
                }
            };

            rl.prompt();

            rl.on("line", async (line) => {
                const input = line.trim();
                if (!input) {
                    rl.prompt();
                    return;
                }

                // Slash commands
                if (input === "/exit" || input === "/quit") {
                    if (opts.save) saveTranscript(opts.save);
                    if (!isJson) {
                        process.stderr.write(
                            chalk.dim(
                                `\nSession ended. ${totalTokens} tokens used.\n`,
                            ),
                        );
                    }
                    rl.close();
                    process.exit(0);
                }

                if (input === "/clear") {
                    messages.length = 0;
                    if (opts.system) {
                        messages.push({ role: "system", content: opts.system });
                    }
                    totalTokens = 0;
                    if (!isJson) {
                        process.stderr.write(
                            chalk.dim("Conversation cleared.\n\n"),
                        );
                    }
                    rl.prompt();
                    return;
                }

                if (input.startsWith("/save")) {
                    const path = input.slice(5).trim() || "chat.txt";
                    saveTranscript(path);
                    rl.prompt();
                    return;
                }

                await sendMessage(input);
                rl.prompt();
            });

            rl.on("close", () => {
                if (opts.save) saveTranscript(opts.save);
                process.exit(0);
            });
        });
}
