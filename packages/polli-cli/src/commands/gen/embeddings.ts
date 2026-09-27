import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface EmbeddingsResponse {
    object: "list";
    data: {
        object: "embedding";
        embedding: number[] | string;
        index: number;
    }[];
    model: string;
    usage: { prompt_tokens: number; total_tokens: number };
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description(
            "Generate embedding vectors for one or more text inputs (stdin ok, one per line)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen embeddings "first text" "second text"\n  printf 'a\\nb\\n' | polli gen embeddings --model google/gemini-embedding-2\n`,
        )
        .argument("[texts...]", "Text inputs (or one per line via stdin)")
        .option("--model <model>", "Embedding model")
        .option("--dimensions <n>", "Output vector dimensions (128-4096)")
        .option(
            "--task-type <type>",
            "Gemini retrieval hint, e.g. RETRIEVAL_QUERY",
        )
        .option(
            "--input-type <type>",
            "Cohere retrieval hint: query or document",
        )
        .action(async (textArgs: string[], opts) => {
            const isHuman = getOutputMode() === "human";

            let inputs = textArgs;
            if (!inputs.length) {
                const stdinText = await readStdin();
                inputs = stdinText
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
            }
            if (!inputs.length) {
                printError(
                    "No text provided. Pass as arguments or pipe via stdin.",
                );
                process.exit(1);
                return;
            }

            const body: Record<string, unknown> = { input: inputs };
            if (opts.model) body.model = opts.model;
            if (opts.dimensions) body.dimensions = Number(opts.dimensions);
            if (opts.taskType) body.task_type = opts.taskType;
            if (opts.inputType) body.input_type = opts.inputType;

            if (isHuman) printInfo("Generating embeddings...");

            try {
                const res = await fetchGen("/v1/embeddings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                const data = (await res.json()) as EmbeddingsResponse;

                if (getOutputMode() === "json") {
                    printResult(data as unknown as Record<string, unknown>);
                    return;
                }

                const sorted = [...data.data].sort((a, b) => a.index - b.index);
                for (const item of sorted) {
                    process.stdout.write(`${JSON.stringify(item.embedding)}\n`);
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
