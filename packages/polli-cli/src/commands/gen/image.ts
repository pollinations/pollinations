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
    printDebug,
} from "../../lib/output.js";
import { t } from "../../lib/i18n.js";
import { startSpinner, stopSpinner, updateSpinner } from "../../lib/spinner.js";
import { ImageGenOptionsSchema } from "../../lib/validation.js";
import { logActivity } from "../../lib/logger.js";
import { getDefaultModel, getDefaultWidth, getDefaultHeight } from "../../lib/config-store.js";
import { getCachedModels } from "../../lib/cache.js";
import { uploadFile } from "../upload.js";

export function createImageCommand() {
    return new Command("image")
        .description("Generate an image from a prompt")
        .argument("<prompt>", "Image description")
        .option("--model <model>", "Image model", getDefaultModel("image") ?? "zimage")
        .option("--width <n>", "Image width", String(getDefaultWidth()))
        .option("--height <n>", "Image height", String(getDefaultHeight()))
        .option("--seed <n>", "Random seed")
        .option("--safe", "Enable safety filters")
        .option("--transparent", "Transparent background (PNG)")
        .option(
            "--image <url...>",
            "Reference image URL(s) for editing/i2i (repeatable); local files auto-uploaded",
        )
        .option("--output <path>", "Save to file", "image.png")
        .addHelpText("after", `
Examples:
  polli gen image "a cat in space" --output cat.png
  polli gen image "cyberpunk city" --model flux --width 1920 --height 1080
  polli gen image "edit this" --image photo.jpg --model nanobanana --output edited.png
        `)
        .action(async (prompt, opts) => {
            const key = await requireKey();
            const isHuman = getOutputMode() === "human";

            // Validate options
            const validation = ImageGenOptionsSchema.safeParse(opts);
            if (!validation.success) {
                printError(`Invalid options: ${validation.error.message}`);
                process.exit(1);
            }
            const validOpts = validation.data;

            // Handle --image: auto-upload local files
            let imageUrls: string[] = [];
            if (validOpts.image) {
                for (const url of validOpts.image) {
                    if (/^https?:\/\//i.test(url)) {
                        imageUrls.push(url);
                    } else {
                        // Local file: upload it
                        printInfo(`Uploading local file: ${url}`);
                        try {
                            const uploaded = await uploadFile(url, key);
                            imageUrls.push(uploaded.url);
                            printInfo(`Uploaded to: ${uploaded.url}`);
                        } catch (err) {
                            printError(
                                `Failed to upload ${url}: ${err instanceof Error ? err.message : err}`,
                            );
                            process.exit(1);
                        }
                    }
                }
            }

            // Validate model exists and supports image generation
            const models = getCachedModels<Array<{ name: string; output_modalities?: string[] }>>();
            if (models) {
                const found = models.find((m) => m.name === validOpts.model);
                if (!found) {
                    printWarn(`Model "${validOpts.model}" not found in cache. It may not exist.`);
                } else if (!found.output_modalities?.includes("image")) {
                    printWarn(`Model "${validOpts.model}" may not support image generation.`);
                }
            }

            const params = new URLSearchParams({
                model: validOpts.model,
                width: String(validOpts.width),
                height: String(validOpts.height),
            });
            if (validOpts.seed) params.set("seed", String(validOpts.seed));
            if (validOpts.safe) params.set("safe", "true");
            if (validOpts.transparent) params.set("transparent", "true");
            if (imageUrls.length > 0) {
                params.set("image", imageUrls.join("|"));
            }

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${BASE_URL}/image/${encodedPrompt}?${params}`;

            if (isHuman) {
                startSpinner(t("gen.generating", { type: "image" }));
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
                });
                logActivity("gen_image", {
                    prompt,
                    model: validOpts.model,
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