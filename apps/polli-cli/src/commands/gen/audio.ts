import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { gen, requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

interface AudioModel {
    name: string;
    voices?: string[];
}

export function createAudioCommand() {
    return new Command("audio")
        .description(
            "Generate speech or music from text (also reads stdin: echo 'hi' | polli gen audio)",
        )
        .argument("[text]", "Text to speak (or pipe via stdin)")
        .option("--voice <voice>", "Voice name", "alloy")
        .option(
            "--list-voices",
            "List available voices from /audio/models and exit",
        )
        .option("--format <fmt>", "mp3/opus/aac/flac/wav", "mp3")
        .option("--model <model>", "Audio model")
        .option("--speed <n>", "Playback speed (0.25-4)")
        .option("--duration <n>", "Music duration in seconds (elevenmusic)")
        .option("--instrumental", "Instrumental only (elevenmusic)")
        .option("--output <path>", "Save to file", "speech.mp3")
        .action(async (textArg, opts) => {
            if (opts.listVoices) {
                const models = await gen<AudioModel[]>("/audio/models").catch(
                    (err) => {
                        printError(
                            err instanceof Error ? err.message : "unknown",
                        );
                        process.exit(1);
                    },
                );
                const voices = Array.from(
                    new Set((models ?? []).flatMap((m) => m.voices ?? [])),
                ).sort();
                if (getOutputMode() === "json") {
                    printResult({ voices });
                } else {
                    for (const v of voices) process.stdout.write(`${v}\n`);
                }
                return;
            }

            const key = requireKey();
            const isHuman = getOutputMode() === "human";
            const inputText = textArg || (await readStdin());
            if (!inputText) {
                printError(
                    "No text provided. Pass as argument or pipe via stdin.",
                );
                process.exit(1);
            }

            const params = new URLSearchParams({ voice: opts.voice });
            if (opts.format !== "mp3")
                params.set("response_format", opts.format);
            if (opts.model) params.set("model", opts.model);
            if (opts.speed) params.set("speed", opts.speed);
            if (opts.duration) params.set("duration", opts.duration);
            if (opts.instrumental) params.set("instrumental", "true");

            const encodedText = encodeURIComponent(inputText);
            const url = `${BASE_URL}/audio/${encodedText}?${params}`;

            if (isHuman) printInfo("Generating audio...");

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, errText);
                    if (hint) {
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(
                        `${res.status} ${res.statusText}: ${errText}`,
                    );
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                printResult({
                    path: opts.output,
                    size: buffer.length,
                    voice: opts.voice,
                });
            } catch (err) {
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
