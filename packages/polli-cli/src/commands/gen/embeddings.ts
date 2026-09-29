import { Command } from "commander";
import { gen } from "../../lib/api.js";
import { exitWithError } from "../../lib/errors.js";
import { fail, getOutputMode, printResult } from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

const DEFAULT_MODEL = "openai/text-embedding-3-small";

interface EmbeddingEntry {
    index?: number;
    embedding: number[];
}

interface EmbeddingResponse {
    data: EmbeddingEntry[];
    usage?: unknown;
    [key: string]: unknown;
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description(
            "Create embeddings for one or more inputs (one vector per line)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen embeddings "first text" "second text"\n  printf 'first\\nsecond\\n' | polli gen embeddings > vectors.jsonl\n  polli gen embeddings "search query" --input-type query --json\n`,
        )
        .argument(
            "[inputs...]",
            "Texts to embed (or pipe one per line via stdin)",
        )
        .option("--model <model>", "Embedding model", DEFAULT_MODEL)
        .option("--dimensions <n>", "Output dimensions (128-4096)")
        .option(
            "--task-type <type>",
            "Gemini retrieval hint (e.g. SEMANTIC_SIMILARITY, RETRIEVAL_QUERY)",
        )
        .option("--input-type <type>", "Cohere input role: query or document")
        .action(async (inputArgs: string[], opts) => {
            const inputs = [...inputArgs];
            if (inputs.length === 0) {
                const piped = await readStdin();
                inputs.push(
                    ...piped
                        .split("\n")
                        .map((line) => line.trim())
                        .filter((line) => line !== ""),
                );
            }
            if (inputs.length === 0) {
                fail("No input. Pass texts as arguments or pipe one per line.");
            }

            const body: Record<string, unknown> = {
                model: opts.model,
                input: inputs,
            };
            if (opts.dimensions !== undefined) {
                const dimensions = Number(opts.dimensions);
                if (!Number.isInteger(dimensions) || dimensions < 1) {
                    fail("--dimensions must be a positive integer");
                }
                body.dimensions = dimensions;
            }
            if (opts.taskType) body.task_type = opts.taskType;
            if (opts.inputType) body.input_type = opts.inputType;

            try {
                const response = await gen<EmbeddingResponse>(
                    "/v1/embeddings",
                    {
                        method: "POST",
                        body,
                    },
                );

                if (getOutputMode() === "json") {
                    printResult(response);
                    return;
                }

                // One vector per line keeps the output pipe- and jq-friendly.
                const ordered = [...(response.data ?? [])].sort(
                    (a, b) => (a.index ?? 0) - (b.index ?? 0),
                );
                for (const entry of ordered) {
                    process.stdout.write(
                        `${JSON.stringify(entry.embedding)}\n`,
                    );
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
