import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";
import { requirePositiveInt } from "../../lib/validate.js";

export function createImageCommand() {
    return new Command("image")
        .description("Generate an image from a prompt")
        .argument("<prompt>", "Image description")
        .option("--model <model>", "Image model", "zimage")
        .option("--width <n>", "Image width", "1024")
        .option("--height <n>", "Image height", "1024")
        .option("--seed <n>", "Random seed")
        .option("--safe", "Enable safety filters")
        .option("--transparent", "Transparent background (PNG)")
        .option(
            "--image <url...>",
            "Reference image URL(s) for editing/i2i (repeatable)",
        )
        .option("--output <path>", "Save to file", "image.png")
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            // Validate dimensions before hitting the API. The server responds
            // with a raw JSON validation error when given non-numeric values
            // (e.g. `--width abc` -> "Invalid input: expected number"),
            // which is confusing — fail fast with a clear message instead.
            const width = requirePositiveInt(opts.width, "--width", {
                min: 1,
                max: 4096,
            });
            const height = requirePositiveInt(opts.height, "--height", {
                min: 1,
                max: 4096,
            });

            const params = new URLSearchParams({
                model: opts.model,
                width: String(width),
                height: String(height),
            });
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.safe) params.set("safe", "true");
            if (opts.transparent) params.set("transparent", "true");
            if (opts.image?.length) {
                const bad = opts.image.find(
                    (u: string) => !/^https?:\/\//i.test(u),
                );
                if (bad) {
                    printError(
                        `--image requires a public http(s) URL, not a local path: ${bad}`,
                    );
                    process.exit(1);
                }
                params.set("image", opts.image.join("|"));
            }

            const encodedPrompt = encodeURIComponent(prompt);
            const path = `/image/${encodedPrompt}?${params}`;

            if (isHuman) printInfo("Generating image...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);

                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
