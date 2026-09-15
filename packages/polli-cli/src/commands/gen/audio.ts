import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
    printWarn,
} from "../../lib/output.js";
import { playAudio, playerMissingHint } from "../../lib/play.js";
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
        .option("--output <path>", "Save to file", "speech.mp3")
        .option("--play", "Play the audio after saving (platform player)")
        .action(async (textArg, opts) => {
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
            if (opts.seed) params.set("seed", opts.seed);

            const encodedText = encodeURIComponent(inputText);
            const path = `/audio/${encodedText}?${params}`;

            if (isHuman) printInfo("Generating audio...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    voice: opts.voice,
                });

                if (opts.play) {
                    if (isHuman) printInfo("Playing...");
                    const ok = await playAudio(opts.output);
                    if (!ok) printWarn(playerMissingHint());
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
