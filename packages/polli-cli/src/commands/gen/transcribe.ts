import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printResult } from "../../lib/output.js";

export function createTranscribeCommand() {
    return new Command("transcribe")
        .description("Transcribe audio to text (speech-to-text)")
        .argument("<file>", "Audio file path (mp3, wav, etc.)")
        .option(
            "--model <model>",
            "STT model (openai/whisper-large-v3, elevenlabs/scribe-v2, assemblyai/universal-2, assemblyai/universal-3.5-pro)",
            "openai/whisper-large-v3",
        )
        .option("--language <lang>", "Language hint (ISO code)")
        .action(async (file, opts) => {
            const isHuman = getOutputMode() === "human";
            if (isHuman) printInfo("Transcribing...");

            try {
                const buffer = readFileSync(file);
                const blob = new Blob([buffer]);

                const formData = new FormData();
                formData.append("file", blob, basename(file));
                formData.append("model", opts.model);
                if (opts.language) formData.append("language", opts.language);

                const res = await fetchGen("/v1/audio/transcriptions", {
                    method: "POST",
                    body: formData,
                });

                const data = (await res.json()) as { text: string };

                if (getOutputMode() === "json") {
                    printResult(data);
                } else {
                    process.stdout.write(`${data.text}\n`);
                }
            } catch (error) {
                exitWithError(error);
            }
        });
}
