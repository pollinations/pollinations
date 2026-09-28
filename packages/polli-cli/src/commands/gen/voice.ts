import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

// Both endpoints take a multipart `audio` file and return audio bytes.
async function postAudio(
    endpoint: string,
    file: string,
    fields: Record<string, string | undefined>,
    output: string,
) {
    const form = new FormData();
    form.append("audio", new Blob([readFileSync(file)]), basename(file));
    for (const [key, value] of Object.entries(fields))
        if (value) form.append(key, value);

    const res = await fetchGen(endpoint, { method: "POST", body: form });
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(output, buffer);
    printMeta({ path: output, size: buffer.length });
}

export function createVoiceChangerCommand() {
    return new Command("voice-changer")
        .description("Re-voice an audio file, keeping words and delivery")
        .argument("<file>", "Source audio file")
        .option("--voice <voice>", "Target voice name or ElevenLabs voice ID")
        .option("--format <fmt>", "mp3/opus/aac/wav/pcm", "mp3")
        .option("--output <path>", "Save to file")
        .action(async (file, opts) => {
            if (getOutputMode() === "human") printInfo("Changing voice...");
            try {
                await postAudio(
                    "/v1/audio/voice-changer",
                    file,
                    { voice: opts.voice, response_format: opts.format },
                    opts.output ?? `voice.${opts.format}`,
                );
            } catch (error) {
                exitWithError(error);
            }
        });
}

export function createVoiceIsolatorCommand() {
    return new Command("voice-isolator")
        .description("Remove background noise and music, keep speech")
        .argument("<file>", "Source audio or video file")
        .option("--output <path>", "Save to file", "isolated.mp3")
        .action(async (file, opts) => {
            if (getOutputMode() === "human") printInfo("Isolating voice...");
            try {
                await postAudio(
                    "/v1/audio/voice-isolator",
                    file,
                    {},
                    opts.output,
                );
            } catch (error) {
                exitWithError(error);
            }
        });
}
