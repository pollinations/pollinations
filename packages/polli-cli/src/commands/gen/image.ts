import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { numberOption } from "../../lib/number-option.js";
import {
    ExitSignal,
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

// The response's Content-Type, not the model name, decides the file
// extension: zimage, flux and most other models return JPEG.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg",
};

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
        .option("--output <path>", "Save to file (extension inferred)")
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({
                model: opts.model,
                width: String(
                    numberOption("--width", opts.width, 1, 4096, true),
                ),
                height: String(
                    numberOption("--height", opts.height, 1, 4096, true),
                ),
            });
            if (opts.seed !== undefined)
                params.set(
                    "seed",
                    String(
                        numberOption("--seed", opts.seed, -1, 2147483647, true),
                    ),
                );
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
                    throw new ExitSignal(1);
                }
                params.set("image", opts.image.join("|"));
            }

            const encodedPrompt = encodeURIComponent(prompt);
            const path = `/image/${encodedPrompt}?${params}`;

            // Before the paid request, so a bad --output folder costs nothing.
            if (opts.output)
                mkdirSync(dirname(opts.output), { recursive: true });
            if (isHuman) printInfo("Generating image...");

            try {
                const res = await fetchGen(path);
                const contentType = (res.headers.get("content-type") ?? "")
                    .split(";")[0]
                    .trim()
                    .toLowerCase();
                const extension =
                    EXTENSION_BY_CONTENT_TYPE[contentType] ?? "png";
                const output = opts.output ?? `image.${extension}`;

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);

                printMeta({
                    path: output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
