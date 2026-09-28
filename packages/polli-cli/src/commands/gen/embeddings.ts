import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { numberOption } from "../../lib/number-option.js";
import { getOutputMode, printInfo } from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface EmbeddingResponse {
    data: { embedding: number[] }[];
    model?: string;
    usage?: unknown;
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description(
            "Create vector embeddings for text inputs. Prints one JSON array per input, one per line",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen embeddings "first text" "second text"\n  printf '%s\\n' "one" "two" | polli gen embeddings\n  polli --json gen embeddings "hello"   # full API response, including usage\n`,
        )
        .argument(
            "[inputs...]",
            "Texts to embed (or pipe one per line via stdin)",
        )
        .option("--model <model>", "Embedding model")
        .option("--dimensions <n>", "Output dimensions (128-4096)")
        .option(
            "--task-type <type>",
            "Gemini retrieval hint (SEMANTIC_SIMILARITY, CLASSIFICATION, ...)",
        )
        .option("--input-type <type>", "Cohere retrieval hint: query/document")
        .action(async (inputs, opts) => {
            const isHuman = getOutputMode() === "human";
            if (!inputs.length) {
                const piped = await readStdin();
                if (piped) inputs = piped.split("\n");
            }
            if (!inputs.length) {
                printError(
                    "No input provided. Pass texts as arguments or pipe one per line via stdin.",
                );
                process.exit(1);
            }

            const body: Record<string, unknown> = { input: inputs };
            if (opts.model) body.model = opts.model;
            if (opts.dimensions !== undefined)
                body.dimensions = numberOption(
                    "--dimensions",
                    opts.dimensions,
                    128,
                    4096,
                    true,
                );
            if (opts.taskType) body.task_type = opts.taskType;
            if (opts.inputType) body.input_type = opts.inputType;

            if (isHuman) printInfo("Embedding...");

            try {
                const res = await fetchGen("/v1/embeddings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                const data = (await res.json()) as EmbeddingResponse;

                if (getOutputMode() === "json") {
                    // Full API response (vectors + model + usage).
                    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
                    return;
                }
                // One JSON array per input, one per line, so the output
                // pipes into a file or jq.
                for (const item of data.data) {
                    process.stdout.write(`${JSON.stringify(item.embedding)}\n`);
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
