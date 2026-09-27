import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createVoiceChangeCommand() {
    return new Command("voice-change")
        .description(
            "Transform the speaker's voice in an audio file, keeping words and timing",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen voice-change talk.mp3 --voice nova\n`,
        )
        .argument(
            "<file>",
            "Source audio file (up to 50 MB, clips up to 5 minutes)",
        )
        .option(
            "--voice <voice>",
            "Target preset voice name or ElevenLabs voice ID",
            "alloy",
        )
        .option("--model <model>", "Voice-changer model")
        .option("--format <fmt>", "mp3/opus/aac/wav/pcm", "mp3")
        .option("--output <path>", "Save to file")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            const output = opts.output ?? `voice.${opts.format}`;

            const buffer = readFileSync(file);
            const formData = new FormData();
            formData.append("audio", new Blob([buffer]), basename(file));
            formData.append("voice", opts.voice);
            if (opts.model) formData.append("model", opts.model);
            if (opts.format !== "mp3")
                formData.append("response_format", opts.format);

            if (isHuman) printInfo("Transforming voice...");

            try {
                const res = await fetchGen("/v1/audio/voice-changer", {
                    method: "POST",
                    body: formData,
                });

                const outBuffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, outBuffer);

                printMeta({
                    path: output,
                    size: outBuffer.length,
                    voice: opts.voice,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
