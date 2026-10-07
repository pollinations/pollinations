import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { mimeTypeFor } from "../../lib/mime.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createIsolateCommand() {
    return new Command("isolate")
        .description(
            "Remove music and background noise from a local audio or video file",
        )
        .argument("<file>", "Source audio or video file path")
        .option("--model <model>", "Voice-isolation model")
        .option("--output <path>", "Save to file", "isolated.mp3")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";

            const formData = new FormData();
            formData.append(
                "audio",
                new Blob([readFileSync(file)], { type: mimeTypeFor(file) }),
                basename(file),
            );
            if (opts.model) formData.append("model", opts.model);

            // Before the paid request, so a bad --output folder costs nothing.
            mkdirSync(dirname(opts.output), { recursive: true });
            if (isHuman) printInfo("Isolating speech...");

            try {
                const res = await fetchGen("/v1/audio/voice-isolator", {
                    method: "POST",
                    body: formData,
                });

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model ?? "elevenlabs/voice-isolator",
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
