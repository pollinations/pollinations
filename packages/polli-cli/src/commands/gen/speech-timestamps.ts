import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";
import { readStdin } from "../../lib/stdin.js";

export function createSpeechTimestampsCommand() {
    return new Command("speech-timestamps")
        .description("Generate speech plus character timings (stdin ok)")
        .argument("[text]", "Text to speak (or pipe via stdin)")
        .option("--voice <voice>", "Voice name or ElevenLabs voice ID")
        .option("--model <model>", "ElevenLabs TTS model")
        .option("--format <fmt>", "mp3/opus/aac/wav/pcm", "mp3")
        .option("--output <path>", "Save audio to file")
        .option("--timings <path>", "Save timings JSON", "timings.json")
        .action(async (textArg, opts) => {
            const input = textArg || (await readStdin());
            if (!input) {
                printError("No text provided. Pass as argument or pipe via stdin.");
                process.exit(1);
            }
            const output = opts.output ?? `speech.${opts.format}`;
            if (getOutputMode() === "human") printInfo("Generating speech...");

            try {
                const res = await fetchGen("/v1/audio/speech/with-timestamps", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        input,
                        voice: opts.voice,
                        model: opts.model,
                        response_format: opts.format,
                    }),
                });
                const { audio_base64, ...timings } = (await res.json()) as {
                    audio_base64: string;
                };
                const buffer = Buffer.from(audio_base64, "base64");
                writeFileSync(output, buffer);
                writeFileSync(opts.timings, JSON.stringify(timings, null, 2));
                printMeta({
                    path: output,
                    size: buffer.length,
                    timings: opts.timings,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
