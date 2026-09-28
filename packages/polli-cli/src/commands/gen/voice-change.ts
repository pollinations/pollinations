import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createVoiceChangeCommand() {
    return new Command("voice-change")
        .description(
            "Transform the voice in a local audio file (preset name or ElevenLabs voice ID)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen voice-change talk.mp3 --voice nova\n  polli gen voice-change talk.mp3 --voice nova --format wav --output out.wav\n`,
        )
        .argument("<file>", "Source audio file, up to 50 MB")
        .option(
            "--voice <voice>",
            "Preset voice name or ElevenLabs voice ID",
            "alloy",
        )
        .option("--model <model>", "Voice changer model")
        .option("--format <fmt>", "mp3/opus/aac/wav/pcm", "mp3")
        .option(
            "--output <path>",
            "Save to file (default: <file>-voiced.<fmt>)",
        )
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            const output =
                opts.output ??
                `${file.replace(/\.[^./]+$/, "")}-voiced.${opts.format}`;

            const formData = new FormData();
            formData.append(
                "audio",
                new Blob([readFileSync(file)]),
                basename(file),
            );
            formData.append("voice", opts.voice);
            formData.append("response_format", opts.format);
            if (opts.model) formData.append("model", opts.model);

            if (isHuman) printInfo("Transforming voice...");

            try {
                const res = await fetchGen("/v1/audio/voice-changer", {
                    method: "POST",
                    body: formData,
                });

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);

                printMeta({
                    path: output,
                    size: buffer.length,
                    voice: opts.voice,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
