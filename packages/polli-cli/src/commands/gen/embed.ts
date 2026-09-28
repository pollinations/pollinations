import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printError, printResult } from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

export function createEmbedCommand() {
    return new Command("embed")
        .description("Create embedding vectors for text (stdin ok)")
        .argument("[texts...]", "Texts to embed (or pipe one via stdin)")
        .option("--model <model>", "Embedding model")
        .option("--dimensions <n>", "Output dimensions (if supported)")
        .action(async (texts: string[], opts) => {
            const input = texts.length ? texts : [await readStdin()];
            if (!input[0]) {
                printError("No text provided. Pass as argument or pipe via stdin.");
                process.exit(1);
            }

            try {
                const res = await fetchGen("/v1/embeddings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input,
                        ...(opts.model && { model: opts.model }),
                        ...(opts.dimensions && {
                            dimensions: Number(opts.dimensions),
                        }),
                    }),
                });
                const data = (await res.json()) as {
                    data: { embedding: number[] }[];
                };

                if (getOutputMode() === "json") printResult(data);
                else
                    for (const item of data.data)
                        process.stdout.write(`${JSON.stringify(item.embedding)}\n`);
            } catch (error) {
                exitWithError(error);
            }
        });
}
