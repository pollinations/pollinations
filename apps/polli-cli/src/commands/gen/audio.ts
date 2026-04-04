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
    text: string,
    opts: {
        voice: string;
        format: string;
        model?: string;
        speed?: string;
        duration?: string;
        instrumental?: boolean;
    },
    index: number,
    outputBase: string,
): Promise<{ path: string; size: number; voice: string }> {
    const params = new URLSearchParams({ voice: opts.voice });
    if (opts.format !== "mp3") params.set("response_format", opts.format);
    params.set("model", opts.model);
    if (opts.speed) params.set("speed", opts.speed);
    if (opts.duration) params.set("duration", opts.duration);
    if (opts.instrumental) params.set("instrumental", "true");

    const encodedText = encodeURIComponent(text);
    const url = `${BASE_URL}/audio/${encodedText}?${params}`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${errText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = `.${opts.format}`;
    const path =
        index > 0
            ? outputBase
                  .replace(/(\.[^.]+)$/, `-${index + 1}$1`)
                  .replace(/^([^.]+)$/, `$1-${index + 1}${ext}`)
            : outputBase;
    writeFileSync(path, buffer);
    return { path, size: buffer.length, voice: opts.voice };
}

export const audioCommand = new Command("audio")
    .description("Generate speech or music from text")
    .argument("<text>", "Text to speak or music description")
    .option("--voice <voice>", "Voice name", "alloy")
    .option("--format <fmt>", "mp3/opus/aac/flac/wav", "mp3")
    .option("--model <model>", "Audio model (default: from config or 'tts-1')")
    .option("--speed <n>", "Playback speed (0.25-4)")
    .option("--duration <n>", "Music duration in seconds (elevenmusic)")
    .option("--instrumental", "Instrumental only (elevenmusic)")
    .option("--count <n>", "Generate multiple clips", "1")
    .option("--output <path>", "Save to file", "speech.mp3")
    .action(async (inputText, opts) => {
        const key = requireKey();
        opts.model = resolveModel("audio", opts.model);
        const isHuman = getOutputMode() === "human";
        const count = Math.max(1, Number.parseInt(opts.count, 10) || 1);

        const spinner = isHuman
            ? ora(
                  count > 1
                      ? `Generating ${count} audio clips...`
                      : "Generating audio...",
              ).start()
            : null;

        try {
            const results = await Promise.all(
                Array.from({ length: count }, (_, i) =>
                    generateOne(key, inputText, opts, i, opts.output),
                ),
            );

            if (count === 1) {
                spinner?.succeed(`Saved to ${results[0].path}`);
                printResult(results[0]);
            } else {
                spinner?.succeed(`Generated ${count} audio clips`);
                for (const r of results) {
                    if (isHuman) printSuccess(`  ${r.path}`);
                }
                printResult(results);
            }
        } catch (err) {
            spinner?.fail("Generation failed");
            printError(err instanceof Error ? err.message : "unknown error");
            process.exit(1);
        }
    });
