import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { getOutputMode, printError, printResult } from "../../lib/output.js";

export function createImageCommand() {
    return new Command("image")
        .description("Generate an image from a prompt")
        .argument("<prompt>", "Image description")
        .option("--model <model>", "Image model", "zimage")
        .option("--width <n>", "Image width", "1024")
        .option("--height <n>", "Image height", "1024")
        .option("--seed <n>", "Random seed")
        .option("--enhance", "AI prompt improvement")
        .option("--negative <text>", "Content to avoid")
        .option("--safe", "Enable safety filters")
        .option("--transparent", "Transparent background (PNG)")
        .option(
            "--image <url...>",
            "Reference image URL(s) for editing/i2i (repeatable)",
        )
        .option("--output <path>", "Save to file", "image.png")
        .action(async (prompt, opts) => {
            const key = requireKey();
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({
                model: opts.model,
                width: opts.width,
                height: opts.height,
            });
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.enhance) params.set("enhance", "true");
            if (opts.negative) params.set("negative_prompt", opts.negative);
            if (opts.safe) params.set("safe", "true");
            if (opts.transparent) params.set("transparent", "true");
            if (opts.image?.length) params.set("image", opts.image.join("|"));

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${BASE_URL}/image/${encodedPrompt}?${params}`;

            const spinner = isHuman ? ora("Generating image...").start() : null;

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(`${res.status} ${res.statusText}: ${text}`);
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                spinner?.succeed(`Saved to ${opts.output}`);

                printResult({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (err) {
                spinner?.fail("Generation failed");
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
