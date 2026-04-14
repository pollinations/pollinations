import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { getOutputMode, printError, printResult } from "../../lib/output.js";

export function createVideoCommand() {
    return new Command("video")
        .description("Generate a video from a prompt")
        .argument("<prompt>", "Video description")
        .option(
            "--model <model>",
            "Video model (default: from config or 'wan')",
        )
        .option("--width <n>", "Video width", "1024")
        .option("--height <n>", "Video height", "1024")
        .option("--duration <n>", "Duration in seconds (1-30)")
        .option("--aspect-ratio <ratio>", "16:9 or 9:16")
        .option("--audio", "Include AI soundtrack")
        .option("--seed <n>", "Random seed")
        .option("--enhance", "AI prompt improvement")
        .option("--negative <text>", "Content to avoid")
        .option("--image <url>", "Reference frame URL")
        .option("--output <path>", "Save to file", "video.mp4")
        .action(async (prompt, opts) => {
            const key = requireKey();
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({
                model: opts.model,
                width: opts.width,
                height: opts.height,
            });
            if (opts.duration) params.set("duration", opts.duration);
            if (opts.aspectRatio) params.set("aspectRatio", opts.aspectRatio);
            if (opts.audio) params.set("audio", "true");
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.enhance) params.set("enhance", "true");
            if (opts.negative) params.set("negative_prompt", opts.negative);
            if (opts.image) params.set("image", opts.image);

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${BASE_URL}/video/${encodedPrompt}?${params}`;

            const spinner = isHuman ? ora("Generating video...").start() : null;

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
