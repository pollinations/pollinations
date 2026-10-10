import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { printEstimate } from "../../lib/estimate.js";
import {
    ExitSignal,
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

// The API default when --model is omitted (gen.pollinations.ai video schema).
const DEFAULT_VIDEO_MODEL = "google/veo-3.1-fast";

export function createVideoCommand() {
    return new Command("video")
        .description("Generate a video from a prompt")
        .argument("<prompt>", "Video description")
        .option("--model <model>", "Video model (default: API default)")
        .option("--width <n>", "Video width", "1024")
        .option("--height <n>", "Video height", "1024")
        .option("--duration <n>", "Duration in seconds (1-30)")
        .option("--aspect-ratio <ratio>", "16:9 or 9:16")
        .option("--audio", "Include AI soundtrack")
        .option("--seed <n>", "Random seed")
        .option("--image <url>", "Reference frame URL")
        .option("--output <path>", "Save to file", "video.mp4")
        .option("--estimate", "Show the estimated Pollen cost; don't generate")
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({
                width: opts.width,
                height: opts.height,
            });
            if (opts.model) params.set("model", opts.model);
            if (opts.duration) params.set("duration", opts.duration);
            if (opts.aspectRatio) params.set("aspectRatio", opts.aspectRatio);
            if (opts.audio) params.set("audio", "true");
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.image) {
                if (!/^https?:\/\//i.test(opts.image)) {
                    printError(
                        `--image requires a public http(s) URL, not a local path: ${opts.image}`,
                    );
                    throw new ExitSignal(1);
                }
                params.set("image", opts.image);
            }

            if (opts.estimate)
                return printEstimate(opts.model ?? DEFAULT_VIDEO_MODEL, {
                    kind: "video",
                    width: Number(opts.width),
                    height: Number(opts.height),
                    references: opts.image ? 1 : 0,
                    duration: opts.duration ? Number(opts.duration) : undefined,
                    audio: !!opts.audio,
                });

            const encodedPrompt = encodeURIComponent(prompt);
            const path = `/video/${encodedPrompt}?${params}`;

            // Before the paid request, so a bad --output folder costs nothing.
            mkdirSync(dirname(opts.output), { recursive: true });
            if (isHuman)
                printInfo("Generating video (this can take up to 60s)...");

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
