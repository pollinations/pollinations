import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { numberOption } from "../../lib/number-option.js";
import {
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
        .option(
            "--timestamps",
            "Also write character timings as JSON next to the audio (supported models only)",
        )
        .option("--output <path>", "Save to file")
        .option("--play", "Play the audio after saving (platform player)")
        .action(async (textArg, opts) => {
            const isHuman = getOutputMode() === "human";
            const output = opts.output ?? `speech.${opts.format}`;
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
            if (opts.seed) params.set("seed", opts.seed);

            const encodedText = encodeURIComponent(inputText);
            const path = `/audio/${encodedText}?${params}`;

            if (isHuman) printInfo("Generating audio...");

            try {
                if (opts.timestamps) {
                    const res = await fetchGen(
                        "/v1/audio/speech/with-timestamps",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                input: inputText,
                                voice: opts.voice,
                                response_format: opts.format,
                                ...(opts.model ? { model: opts.model } : {}),
                                ...(opts.seed
                                    ? {
                                          seed: numberOption(
                                              "--seed",
                                              opts.seed,
                                              0,
                                              4294967295,
                                              true,
                                          ),
                                      }
                                    : {}),
                            }),
                        },
                    );

                    const data = (await res.json()) as {
                        audio_base64: string;
                        alignment: unknown;
                        normalized_alignment?: unknown;
                    };
                    const audio = Buffer.from(data.audio_base64, "base64");
                    writeFileSync(output, audio);
                    const timingsPath = output
                        .replace(/\.[^./]+$/, "")
                        .concat(".timings.json");
                    writeFileSync(
                        timingsPath,
                        `${JSON.stringify(
                            {
                                alignment: data.alignment,
                                normalized_alignment: data.normalized_alignment,
                            },
                            null,
                            2,
                        )}\n`,
                    );
                    printMeta({
                        path: output,
                        size: audio.length,
                        timings: timingsPath,
                        voice: opts.voice,
                    });
                } else {
                    const res = await fetchGen(path);

                    const buffer = Buffer.from(await res.arrayBuffer());
                    writeFileSync(output, buffer);
                    printMeta({
                        path: output,
                        size: buffer.length,
                        voice: opts.voice,
                    });
                }

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
