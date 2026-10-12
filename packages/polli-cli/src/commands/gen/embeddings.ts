import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { numberOption } from "../../lib/number-option.js";
import { fail, getOutputMode, printResult } from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface EmbeddingResponse {
    data: Array<{ embedding: number[] | string; index: number }>;
    model: string;
    usage: { prompt_tokens: number; total_tokens: number };
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description(
            "Generate vector embeddings for one or more texts (stdin: one per line)",
        )
        .argument("[inputs...]", "Texts to embed (or pipe via stdin)")
        .option("--model <model>", "Embedding model")
        .option("--dimensions <n>", "Output dimensions (128-4096)")
        .option(
            "--task-type <type>",
            "Gemini retrieval hint: SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING, RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY, CODE_RETRIEVAL_QUERY, QUESTION_ANSWERING, FACT_VERIFICATION",
        )
        .option("--input-type <type>", "Cohere retrieval role: query, document")
        .action(async (inputsArg: string[], opts) => {
            const inputs = inputsArg.length
                ? inputsArg
                : (await readStdin()).split(/\r?\n/).filter(Boolean);
            if (inputs.length === 0) {
                fail("No input provided. Pass as arguments or pipe via stdin.");
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

            try {
                const res = await fetchGen("/v1/embeddings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const data = (await res.json()) as EmbeddingResponse;

                if (getOutputMode() === "json") {
                    printResult(data);
                    return;
                }
                for (const item of [...data.data].sort(
                    (a, b) => a.index - b.index,
                )) {
                    process.stdout.write(`${JSON.stringify(item.embedding)}\n`);
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
