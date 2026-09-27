import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createIsolateCommand() {
    return new Command("isolate")
        .description(
            "Remove music and background noise from an audio or video file",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen isolate interview.mp4\n`,
        )
        .argument(
            "<file>",
            "Source audio or video file (up to 50 MB, at least 4.6s)",
        )
        .option("--model <model>", "Voice-isolator model")
        .option("--output <path>", "Save to file", "isolated.mp3")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";

            const buffer = readFileSync(file);
            const formData = new FormData();
            formData.append("audio", new Blob([buffer]), basename(file));
            if (opts.model) formData.append("model", opts.model);

            if (isHuman) printInfo("Isolating speech...");

            try {
                const res = await fetchGen("/v1/audio/voice-isolator", {
                    method: "POST",
                    body: formData,
                });

                const outBuffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, outBuffer);

                printMeta({
                    path: opts.output,
                    size: outBuffer.length,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
