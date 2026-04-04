import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../../lib/api.js";
import { BASE_URL, resolveModel } from "../../lib/config.js";
import {
    getOutputMode,
    printError,
    printResult,
    printSuccess,
} from "../../lib/output.js";

async function generateOne(
    key: string,
    prompt: string,
    opts: {
        model: string;
        width: string;
        height: string;
        seed?: string;
        nologo?: boolean;
        enhance?: boolean;
        negative?: string;
        quality?: string;
        safe?: boolean;
        transparent?: boolean;
    },
    index: number,
    outputBase?: string,
): Promise<{ path?: string; url: string; size: number; model: string }> {
    const params = new URLSearchParams({
        model: opts.model,
        width: opts.width,
        height: opts.height,
        nologo: opts.nologo ? "true" : "false",
    });
    if (opts.seed) params.set("seed", String(Number(opts.seed) + index));
    if (opts.enhance) params.set("enhance", "true");
    if (opts.negative) params.set("negative_prompt", opts.negative);
    if (opts.quality) params.set("quality", opts.quality);
    if (opts.safe) params.set("safe", "true");
    if (opts.transparent) params.set("transparent", "true");
    if (opts.image) params.set("image", opts.image);

    const encodedPrompt = encodeURIComponent(prompt);
    const url = `${BASE_URL}/image/${encodedPrompt}?${params}`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    if (outputBase) {
        const ext = opts.transparent ? ".png" : ".jpg";
        const path =
            index > 0
                ? outputBase
                      .replace(/(\.[^.]+)$/, `-${index + 1}$1`)
                      .replace(/^([^.]+)$/, `$1-${index + 1}${ext}`)
                : outputBase;
        writeFileSync(path, buffer);
        return { path, url, size: buffer.length, model: opts.model };
    }

    return { url, size: buffer.length, model: opts.model };
}

export const imageCommand = new Command("image")
    .description("Generate an image from a prompt")
    .argument("<prompt>", "Image description")
    .option("--model <model>", "Image model (default: from config or 'flux')")
    .option("--width <n>", "Image width", "1024")
    .option("--height <n>", "Image height", "1024")
    .option("--seed <n>", "Random seed")
    .option("--nologo", "Remove Pollinations watermark")
    .option("--enhance", "AI prompt improvement")
    .option("--negative <text>", "Content to avoid")
    .option("--quality <level>", "low/medium/high/hd", "medium")
    .option("--safe", "Enable safety filters")
    .option("--transparent", "Transparent background (PNG)")
    .option("--image <url>", "Reference image URL for editing/i2i")
    .option("--count <n>", "Generate multiple images", "1")
    .option("--output <path>", "Save to file")
    .action(async (prompt, opts) => {
        const key = requireKey();
        opts.model = resolveModel(opts.model);
        const isHuman = getOutputMode() === "human";
        const count = Math.max(1, Number.parseInt(opts.count, 10) || 1);

        const spinner = isHuman
            ? ora(
                  count > 1
                      ? `Generating ${count} images...`
                      : "Generating image...",
              ).start()
            : null;

        try {
            const results = await Promise.all(
                Array.from({ length: count }, (_, i) =>
                    generateOne(key, prompt, opts, i, opts.output),
                ),
            );

            if (count === 1) {
                const r = results[0];
                if (r.path) {
                    spinner?.succeed(`Saved to ${r.path}`);
                } else {
                    spinner?.succeed("Image generated");
                }
                printResult(r);
            } else {
                spinner?.succeed(`Generated ${count} images`);
                for (const r of results) {
                    if (r.path && isHuman) {
                        printSuccess(`  ${r.path}`);
                    }
                }
                printResult(results);
            }
        } catch (err) {
            spinner?.fail("Generation failed");
            printError(err instanceof Error ? err.message : "unknown error");
            process.exit(1);
        }
    });
