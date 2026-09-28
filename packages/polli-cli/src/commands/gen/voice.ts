import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

/** The API answers with the audio format that was asked for. */
const AUDIO_EXTENSIONS: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/opus": "opus",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/pcm": "pcm",
};

const extensionFor = (contentType: string | null, requested: string) => {
    const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
    return AUDIO_EXTENSIONS[type] ?? requested;
};

/**
 * Shared handler for the two file-to-file audio endpoints. Both take one local
 * media file plus a response format and answer with audio bytes.
 */
const audioToAudio = (
    name: string,
    description: string,
    endpoint: string,
    declareOptions: (command: Command) => Command,
) =>
    declareOptions(
        new Command(name)
            .description(description)
            .argument("<file>", "Local audio or video file")
            .option(
                "--format <fmt>",
                "Output format: mp3, opus, aac, wav, pcm",
                "mp3",
            )
            .option("--output <path>", "Save to file")
            .option("--model <model>", "Model override"),
    ).action(async (file, opts) => {
        const isHuman = getOutputMode() === "human";

        try {
            const buffer = readFileSync(file);
            const formData = new FormData();
            formData.append("file", new Blob([buffer]), basename(file));
            formData.append("response_format", opts.format);
            if (opts.voice) formData.append("voice", opts.voice);
            if (opts.model) formData.append("model", opts.model);

            if (isHuman) printInfo(`${description}...`);

            const res = await fetchGen(endpoint, {
                method: "POST",
                body: formData,
            });
            const audio = Buffer.from(await res.arrayBuffer());
            const output =
                opts.output ??
                `${name}.${extensionFor(res.headers.get("content-type"), opts.format)}`;

            writeFileSync(output, audio);
            printMeta({ path: output, size: audio.length });
        } catch (error) {
            exitWithError(error);
        }
    });

export function createVoiceChangeCommand() {
    return audioToAudio(
        "voice-change",
        "Convert speech to another voice",
        "/v1/audio/voice-changer",
        (command) =>
            command.option(
                "--voice <voice>",
                "Preset voice name or ElevenLabs voice ID",
                "nova",
            ),
    );
}

export function createIsolateCommand() {
    return audioToAudio(
        "isolate",
        "Isolate speech, removing music and background noise",
        "/v1/audio/voice-isolator",
        (command) => command,
    );
}
