import { existsSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import { uploadLocalFile } from "../../lib/media-upload.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

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
            "--image <ref...>",
            "Reference image(s) for editing/i2i — public http(s) URL or local file path; local paths are auto-uploaded to media.pollinations.ai. Repeatable.",
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
            if (opts.image?.length) {
                // Resolve each entry to a public URL: http(s) URLs pass
                // through untouched; local paths are uploaded to
                // media.pollinations.ai and the returned URL is substituted
                // in place. Order is preserved — i2i providers (including
                // the xAI Grok-Imagine path shipped in #10617) treat the
                // first reference as the primary image.
                const resolved: string[] = [];
                for (const ref of opts.image as string[]) {
                    if (/^https?:\/\//i.test(ref)) {
                        resolved.push(ref);
                        continue;
                    }
                    if (!existsSync(ref)) {
                        printError(`Reference image not found: ${ref}`);
                        process.exit(1);
                    }
                    if (isHuman) printInfo(`Uploading ${ref}...`);
                    try {
                        const uploaded = await uploadLocalFile(ref, key);
                        resolved.push(uploaded.url);
                    } catch (err) {
                        printError(
                            `Failed to upload ${ref}: ${err instanceof Error ? err.message : "unknown error"}`,
                        );
                        process.exit(1);
                    }
                }
                params.set("image", resolved.join("|"));
            }

            const encodedPrompt = encodeURIComponent(prompt);
            const url = `${BASE_URL}/image/${encodedPrompt}?${params}`;

            if (isHuman) printInfo("Generating image...");

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, text);
                    if (hint) {
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(`${res.status} ${res.statusText}: ${text}`);
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);

                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (err) {
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
