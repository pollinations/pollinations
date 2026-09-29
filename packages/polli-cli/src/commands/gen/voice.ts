import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    ExitSignal,
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

const VOICE_CHANGE_MODEL = "elevenlabs/eleven-multilingual-sts-v2";
const VOICE_ISOLATOR_MODEL = "elevenlabs/voice-isolator";
const VOICE_CHANGE_FORMATS = ["mp3", "opus", "aac", "wav", "pcm"];

export function createVoiceChangeCommand() {
    return new Command("voice-change")
        .description(
            "Re-speak an audio file in another voice, keeping the words and timing",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen voice-change talk.mp3 --voice nova\n  polli gen voice-change talk.wav --voice 21m00Tcm4TlvDq8ikWAM --format wav\n`,
        )
        .argument("<file>", "Local audio file (mp3, wav, ...; up to 50 MB)")
        .option(
            "--voice <voice>",
            "Preset voice name or ElevenLabs voice ID",
            "alloy",
        )
        .option("--model <model>", "Voice changer model", VOICE_CHANGE_MODEL)
        .option(
            "--format <fmt>",
            `Output format: ${VOICE_CHANGE_FORMATS.join("/")}`,
            "mp3",
        )
        .option(
            "--output <path>",
            "Save to file (default: voice-change.<format>)",
        )
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            if (!VOICE_CHANGE_FORMATS.includes(opts.format)) {
                printError(
                    `--format must be one of: ${VOICE_CHANGE_FORMATS.join(", ")}`,
                );
                throw new ExitSignal(1);
            }

            const output = opts.output ?? `voice-change.${opts.format}`;
            const body = new FormData();
            body.append("model", opts.model);
            body.append("voice", opts.voice);
            body.append("response_format", opts.format);
            body.append(
                "audio",
                new Blob([readFileSync(file)]),
                basename(file),
            );

            if (isHuman) printInfo("Changing voice...");

            try {
                const res = await fetchGen("/v1/audio/voice-changer", {
                    method: "POST",
                    body,
                });
                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);
                printMeta({
                    path: output,
                    size: buffer.length,
                    voice: opts.voice,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}

export function createIsolateCommand() {
    return new Command("isolate")
        .description(
            "Remove music and background noise, keeping only the speech",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen isolate interview.mp4\n  polli gen isolate recording.wav --output clean.mp3\n`,
        )
        .argument("<file>", "Local audio or video file (up to 50 MB)")
        .option("--model <model>", "Voice isolator model", VOICE_ISOLATOR_MODEL)
        .option("--output <path>", "Save to file", "isolated.mp3")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";

            const body = new FormData();
            body.append("model", opts.model);
            body.append(
                "audio",
                new Blob([readFileSync(file)]),
                basename(file),
            );

            if (isHuman) printInfo("Isolating speech...");

            try {
                const res = await fetchGen("/v1/audio/voice-isolator", {
                    method: "POST",
                    body,
                });
                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
