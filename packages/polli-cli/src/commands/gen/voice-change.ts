import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { mimeTypeFor } from "../../lib/mime.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createVoiceChangeCommand() {
    return new Command("voice-change")
        .description("Re-speak a local audio file in another voice")
        .argument("<file>", "Source audio file path")
        .option(
            "--voice <voice>",
            "Preset voice name or ElevenLabs voice ID",
            "alloy",
        )
        .option("--model <model>", "Voice-change model")
        .option("--format <fmt>", "mp3/opus/aac/wav/pcm", "mp3")
        .option("--output <path>", "Save to file")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            const output = opts.output ?? `voice.${opts.format}`;

            const formData = new FormData();
            formData.append(
                "audio",
                new Blob([readFileSync(file)], { type: mimeTypeFor(file) }),
                basename(file),
            );
            formData.append("voice", opts.voice);
            if (opts.model) formData.append("model", opts.model);
            if (opts.format !== "mp3")
                formData.append("response_format", opts.format);

            // Before the paid request, so a bad --output folder costs nothing.
            mkdirSync(dirname(output), { recursive: true });
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
                    model:
                        opts.model ?? "elevenlabs/eleven-multilingual-sts-v2",
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
