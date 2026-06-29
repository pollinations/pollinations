import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
    printWarn,
    printDebug,
} from "../../lib/output.js";
import { t } from "../../lib/i18n.js";
import { startSpinner, stopSpinner, updateSpinner } from "../../lib/spinner.js";
import { VideoGenOptionsSchema } from "../../lib/validation.js";
import { logActivity } from "../../lib/logger.js";
import { getDefaultModel } from "../../lib/config-store.js";
import { getCachedModels } from "../../lib/cache.js";

export function createVideoCommand() {
    return new Command("video")
        .description("Generate a video from a prompt")
        .argument("<prompt>", "Video description")
        .option(
            "--model <model>",
            "Video model (default: from config or 'wan')",
            getDefaultModel("video") ?? "wan-fast",
        )
        .option("--width <n>", "Video width", "1024")
        .option("--height <n>", "Video height", "1024")
        .option("--duration <n>", "Duration in seconds (1-30)")
        .option("--aspect-ratio <ratio>", "16:9 or 9:16")
        .option("--audio", "Include AI soundtrack")
        .option("--seed <n>", "Random seed")
        .option("--image <url>", "Reference frame URL; local files auto-uploaded")
        .option("--output <path>", "Save to file", "video.mp4")
        .addHelpText("after", `
Examples:
  polli gen video "a waterfall in slow motion" --duration 5 --output clip.mp4
  polli gen video "spacecraft landing on mars" --model wan-fast --output mars.mp4
  polli gen video "animate this" --image photo.jpg --duration 3 --output animated.mp4
        `)
        .action(async (prompt, opts) => {
            const key = await requireKey();
            const isHuman = getOutputMode() === "human";

            // Validate options
            const validation = VideoGenOptionsSchema.safeParse(opts);
            if (!validation.success) {
                printError(`Invalid options: ${validation.error.message}`);
                process.exit(1);
            }
            const validOpts = validation.data;

            // Handle --image: auto-upload local file
            let imageUrl: string | undefined;
            if (validOpts.image) {
                if (/^https?:\/\//i.test(validOpts.image)) {
                    imageUrl = validOpts.image;
                } else {
                    printInfo(`Uploading local file: ${validOpts.image}`);
                    try {
                        const { uploadFile } = await import("../upload.js");
                        const uploaded = await uploadFile(validOpts.image, key);
                        imageUrl = uploaded.url;
                        printInfo(`Uploaded to: ${imageUrl}`);
                    } catch (err) {
                        printError(
                            `Failed to upload ${validOpts.image}: ${err instanceof Error ? err.message : err}`,
                        );
                        process.exit(1);
                    }
                }
            }

            // Validate model exists
            const models = getCachedModels<Array<{ name: string; output_modalities?: string[] }>>();
            if (models && validOpts.model) {
                const found = models.find((m) => m.name === validOpts.model);
                if (!found) {
                    printWarn(`Model "${validOpts.model}" not found in cache. It may not exist.`);
                } else if (!found.output_modalities?.includes("video")) {
                    printWarn(`Model "${validOpts.model}" may not support video generation.`);
                }
            }

            const params = new URLSearchParams({
                width: String(validOpts.width),
                height: String(validOpts.height),
            });
            if (validOpts.model) params.set("model", validOpts.model);
            if (validOpts.duration) params.set("duration", String(validOpts.duration));
            if (validOpts.aspectRatio) params.set("aspectRatio", validOpts.aspectRatio);
            if (validOpts.audio) params.set("audio", "true");
            if (validOpts.seed) params.set("seed", String(validOpts.seed));
            if (imageUrl) params.set("image", imageUrl);

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${BASE_URL}/video/${encodedPrompt}?${params}`;

            if (isHuman) {
                startSpinner(t("gen.generating.video"));
            }
            printDebug(`Request URL: ${url}`);

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, text);
                    if (hint) {
                        stopSpinner(false);
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(`${res.status} ${res.statusText}: ${text}`);
                }
                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(validOpts.output, buffer);
                stopSpinner(true, t("gen.saved", { path: validOpts.output }));
                printMeta({
                    path: validOpts.output,
                    size: buffer.length,
                    model: validOpts.model,
                    duration: validOpts.duration ?? "auto",
                });
                logActivity("gen_video", {
                    prompt,
                    model: validOpts.model,
                    duration: validOpts.duration,
                    width: validOpts.width,
                    height: validOpts.height,
                    output: validOpts.output,
                    size: buffer.length,
                });
            } catch (err) {
                stopSpinner(false);
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}