import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    ExitSignal,
    fail,
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";
import { playAudio } from "../../lib/play.js";
import { readStdin } from "../../lib/stdin.js";

export function createAudioCommand() {
    return new Command("audio")
        .description(
            "Generate speech or music from text (stdin ok). Discover voices: polli models --type audio --json | jq '.[].voices'",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen audio "hello world" --play\n  echo "the sky today" | polli gen audio --voice callum --play\n  polli gen audio --model elevenmusic --duration 30 "lofi beats" --output song.mp3\n`,
        )
        .argument("[text]", "Text to speak (or pipe via stdin)")
        .option("--voice <voice>", "Voice name", "sage")
        .option("--format <fmt>", "mp3/opus/aac/flac/wav", "mp3")
        .option("--model <model>", "Audio model")
        .option("--speed <n>", "Playback speed (0.25-4)")
        .option("--duration <n>", "Music duration in seconds (elevenmusic)")
        .option("--instrumental", "Instrumental only (elevenmusic)")
        .option("--seed <n>", "Seed for deterministic output")
        .option("--output <path>", "Save to file")
        .option("--play", "Play the audio after saving (platform player)")
        .option(
            "--timestamps",
            "Also save character timings next to the audio (JSON)",
        )
        .action(async (textArg, opts) => {
            const isHuman = getOutputMode() === "human";
            const output = opts.output ?? `speech.${opts.format}`;
            const inputText = textArg || (await readStdin());
            if (!inputText) {
                printError(
                    "No text provided. Pass as argument or pipe via stdin.",
                );
                throw new ExitSignal(1);
            }

            const params = new URLSearchParams({ voice: opts.voice });
            if (opts.format !== "mp3")
                params.set("response_format", opts.format);
            if (opts.model) params.set("model", opts.model);
            if (opts.speed) params.set("speed", opts.speed);
            if (opts.duration) params.set("duration", opts.duration);
            if (opts.instrumental) params.set("instrumental", "true");
            if (opts.seed) params.set("seed", opts.seed);

            if (opts.timestamps) {
                await generateWithTimestamps(inputText, output, {
                    voice: opts.voice,
                    model: opts.model,
                    format: opts.format,
                    seed: opts.seed,
                    isHuman,
                });
                return;
            }

            const encodedText = encodeURIComponent(inputText);
            const path = `/audio/${encodedText}?${params}`;

            if (isHuman) printInfo("Generating audio...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);
                printMeta({
                    path: output,
                    size: buffer.length,
                    voice: opts.voice,
                });

                if (opts.play) {
                    if (isHuman) printInfo("Playing...");
                    const ok = await playAudio(output);
                    if (!ok)
                        fail(
                            "Audio playback failed. Check the saved file and player installation.",
                        );
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}

const DEFAULT_TIMESTAMP_MODEL = "elevenlabs/eleven-v3";

interface SpeechWithTimestamps {
    audio_base64: string;
    alignment?: SpeechAlignment;
    normalized_alignment?: SpeechAlignment;
}

interface SpeechAlignment {
    characters?: string[];
    character_start_times_seconds?: number[];
    character_end_times_seconds?: number[];
}

/**
 * `/v1/audio/speech/with-timestamps` returns base64 audio plus character
 * timings. Save the audio like a normal `gen audio` run and drop the timings
 * beside it, so both stay together.
 */
async function generateWithTimestamps(
    input: string,
    output: string,
    opts: {
        voice: string;
        model?: string;
        format: string;
        seed?: string;
        isHuman: boolean;
    },
): Promise<void> {
    const body: Record<string, unknown> = {
        input,
        voice: opts.voice,
        model: opts.model ?? DEFAULT_TIMESTAMP_MODEL,
    };
    if (opts.format !== "mp3") body.response_format = opts.format;
    if (opts.seed) body.seed = Number(opts.seed);

    if (opts.isHuman) printInfo("Generating audio with timestamps...");

    try {
        const res = await fetchGen("/v1/audio/speech/with-timestamps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = (await res.json()) as SpeechWithTimestamps;

        const buffer = Buffer.from(data.audio_base64, "base64");
        writeFileSync(output, buffer);

        const timingsPath = `${output}.json`;
        writeFileSync(
            timingsPath,
            `${JSON.stringify(
                {
                    model: body.model,
                    voice: opts.voice,
                    alignment: data.alignment ?? null,
                    normalized_alignment: data.normalized_alignment ?? null,
                },
                null,
                2,
            )}\n`,
        );

        printMeta({
            path: output,
            size: buffer.length,
            voice: opts.voice,
            timestamps: timingsPath,
        });
    } catch (error) {
        exitWithError(error);
    }
}
