import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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

interface AudioOptions {
    voice: string;
    format: string;
    model?: string;
    speed?: string;
    duration?: string;
    instrumental?: boolean;
    seed?: string;
}

async function generateSimple(
    text: string,
    opts: AudioOptions,
): Promise<Buffer> {
    const params = new URLSearchParams({ voice: opts.voice });
    if (opts.format !== "mp3") params.set("response_format", opts.format);
    if (opts.model) params.set("model", opts.model);
    if (opts.speed) params.set("speed", opts.speed);
    if (opts.duration) params.set("duration", opts.duration);
    if (opts.instrumental) params.set("instrumental", "true");
    if (opts.seed) params.set("seed", opts.seed);

    const res = await fetchGen(`/audio/${encodeURIComponent(text)}?${params}`);
    return Buffer.from(await res.arrayBuffer());
}

/** Character-level timing needs the JSON+base64 endpoint; writes the
 * alignment data to `alignmentPath` and returns the decoded audio. */
async function generateWithTimestamps(
    text: string,
    opts: AudioOptions,
    alignmentPath: string,
): Promise<Buffer> {
    const body: Record<string, unknown> = { input: text, voice: opts.voice };
    if (opts.model) body.model = opts.model;
    if (opts.format !== "mp3") body.response_format = opts.format;
    if (opts.seed) body.seed = Number(opts.seed);

    const res = await fetchGen("/v1/audio/speech/with-timestamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
        audio_base64: string;
        alignment: unknown;
        normalized_alignment: unknown;
    };
    writeFileSync(
        alignmentPath,
        JSON.stringify(
            {
                alignment: data.alignment,
                normalized_alignment: data.normalized_alignment,
            },
            null,
            2,
        ),
    );
    return Buffer.from(data.audio_base64, "base64");
}

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
            "Also save character-level timing as JSON next to the audio",
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

            // Before the paid request, so a bad --output folder costs nothing.
            mkdirSync(dirname(output), { recursive: true });
            if (isHuman) printInfo("Generating audio...");

            try {
                const alignmentPath = opts.timestamps
                    ? `${output}.json`
                    : undefined;
                const buffer = alignmentPath
                    ? await generateWithTimestamps(
                          inputText,
                          opts,
                          alignmentPath,
                      )
                    : await generateSimple(inputText, opts);

                writeFileSync(output, buffer);
                printMeta({
                    path: output,
                    size: buffer.length,
                    voice: opts.voice,
                    ...(alignmentPath && { timestamps: alignmentPath }),
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
