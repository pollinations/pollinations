import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface EmbeddingItem {
    embedding: number[];
    index: number;
}

interface EmbeddingsResponse {
    data: EmbeddingItem[];
    model: string;
    usage?: unknown;
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description(
            "Generate embedding vectors for text inputs (stdin ok, one per line)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen embeddings "first text" "second text"\n  cat lines.txt | polli gen embeddings\n  polli gen embeddings --model openai-3-small --dimensions 256 "hello"\n`,
        )
        .argument("[inputs...]", "Text inputs (or pipe one per line via stdin)")
        .option("--model <model>", "Embeddings model")
        .option("--dimensions <n>", "Output vector size")
        .option("--task-type <type>", "Retrieval hint (Gemini)")
        .option("--input-type <type>", "Retrieval hint (Cohere)")
        .action(async (inputsArg: string[], opts) => {
            const isHuman = getOutputMode() === "human";

            let inputs = inputsArg;
            if (inputs.length === 0) {
                const stdin = await readStdin();
                inputs = stdin
                    ? stdin.split("\n").map((l) => l.trim()).filter(Boolean)
                    : [];
            }

            if (inputs.length === 0) {
                printError(
                    "No input provided. Pass as arguments or pipe lines via stdin.",
                );
                process.exit(1);
            }

            const body: Record<string, unknown> = { model: opts.model, input: inputs };
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
                    printResult(data);
                } else {
                    for (const item of data.data) {
                        process.stdout.write(`${JSON.stringify(item.embedding)}\n`);
                    }
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
