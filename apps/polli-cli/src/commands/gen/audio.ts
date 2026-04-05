import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { getOutputMode, printError, printResult } from "../../lib/output.js";

export function createAudioCommand() {
    return new Command("audio")
        .description("Generate speech or music from text")
        .argument("<text>", "Text to speak or music description")
        .option("--voice <voice>", "Voice name", "alloy")
        .option("--format <fmt>", "mp3/opus/aac/flac/wav", "mp3")
        .option("--model <model>", "Audio model")
        .option("--speed <n>", "Playback speed (0.25-4)")
        .option("--duration <n>", "Music duration in seconds (elevenmusic)")
        .option("--instrumental", "Instrumental only (elevenmusic)")
        .option("--output <path>", "Save to file", "speech.mp3")
        .action(async (inputText, opts) => {
            const key = requireKey();
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({ voice: opts.voice });
            if (opts.format !== "mp3")
                params.set("response_format", opts.format);
            if (opts.model) params.set("model", opts.model);
            if (opts.speed) params.set("speed", opts.speed);
            if (opts.duration) params.set("duration", opts.duration);
            if (opts.instrumental) params.set("instrumental", "true");

            const encodedText = encodeURIComponent(inputText);
            const url = `${BASE_URL}/audio/${encodedText}?${params}`;

            const spinner = isHuman ? ora("Generating audio...").start() : null;

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                    signal: AbortSignal.timeout(120_000),
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    throw new Error(
                        `${res.status} ${res.statusText}: ${errText}`,
                    );
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                spinner?.succeed(`Saved to ${opts.output}`);
                printResult({
                    path: opts.output,
                    size: buffer.length,
                    voice: opts.voice,
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
