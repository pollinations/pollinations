import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo } from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface EmbeddingResponse {
    data?: { embedding?: number[]; index?: number }[];
    usage?: Record<string, unknown>;
}

export function createEmbeddingsCommand() {
    return new Command("embeddings")
        .description("Generate embeddings for one or more inputs")
        .argument(
            "[inputs...]",
            "Texts to embed (one per line from stdin if omitted)",
        )
        .option("--model <model>", "Embedding model")
        .option("--dimensions <n>", "Output vector dimensions")
        .option("--task-type <type>", "Retrieval hint for Gemini models")
        .option("--input-type <type>", "Retrieval hint for Cohere models")
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen embeddings "first text" "second text"\n  printf 'a\\nb\\n' | polli gen embeddings\n  polli gen embeddings "query" --task-type RETRIEVAL_QUERY | jq .\n`,
        )
        .action(async (inputs: string[], opts) => {
            const isHuman = getOutputMode() === "human";

            // Arguments win; otherwise one input per non-empty stdin line.
            const fromArgs = (inputs ?? []).filter((value) => value.length > 0);
            let texts = fromArgs;
            if (texts.length === 0) {
                const piped = await readStdin();
                texts = piped
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
            }
            if (texts.length === 0) {
                return exitWithError(
                    new Error(
                        "No input provided. Pass texts as arguments or pipe one per line via stdin.",
                    ),
                );
            }

            const body: Record<string, unknown> = { input: texts };
            if (opts.model) body.model = opts.model;
            if (opts.dimensions) body.dimensions = Number(opts.dimensions);
            if (opts.taskType) body.task_type = opts.taskType;
            if (opts.inputType) body.input_type = opts.inputType;

            if (isHuman) printInfo(`Embedding ${texts.length} input(s)...`);

            try {
                const res = await fetchGen("/v1/embeddings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const data = (await res.json()) as EmbeddingResponse;

                // The global --json mode prints the whole response instead of
                // the vector-per-line stream.
                if (getOutputMode() === "json") {
                    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
                    return;
                }

                // One JSON array per line, so the output pipes into a file or jq.
                const vectors = (data.data ?? [])
                    .slice()
                    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                    .map((entry) => entry.embedding ?? []);
                if (vectors.length === 0) {
                    return exitWithError(
                        new Error("The API returned no embeddings."),
                    );
                }
                for (const vector of vectors) {
                    process.stdout.write(`${JSON.stringify(vector)}\n`);
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
