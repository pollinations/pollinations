import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function createIsolateCommand() {
    return new Command("isolate")
        .description(
            "Remove music and background noise from a local audio or video file, keeping only the speech",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen isolate interview.mp4\n  polli gen isolate interview.mp4 --output clean.mp3\n`,
        )
        .argument("<file>", "Source audio or video file, up to 50 MB")
        .option("--model <model>", "Isolator model")
        .option(
            "--output <path>",
            "Save to file (default: <file>-isolated.mp3)",
        )
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            const output =
                opts.output ?? `${file.replace(/\.[^./]+$/, "")}-isolated.mp3`;

            const formData = new FormData();
            formData.append(
                "audio",
                new Blob([readFileSync(file)]),
                basename(file),
            );
            if (opts.model) formData.append("model", opts.model);

            if (isHuman) printInfo("Isolating speech...");

            try {
                const res = await fetchGen("/v1/audio/voice-isolator", {
                    method: "POST",
                    body: formData,
                });

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);

                printMeta({
                    path: output,
                    size: buffer.length,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
