import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
} from "../../lib/output.js";

export function createTranscribeCommand() {
    return new Command("transcribe")
        .description("Transcribe audio to text (speech-to-text)")
        .argument("<file>", "Audio file path (mp3, wav, etc.)")
        .option(
            "--model <model>",
            "STT model (whisper, scribe, universal-2, universal-3-pro)",
            "whisper",
        )
        .option("--language <lang>", "Language hint (ISO code)")
        .action(async (file, opts) => {
            const key = requireKey();
            const isHuman = getOutputMode() === "human";
            if (isHuman) printInfo("Transcribing...");

            try {
                const buffer = readFileSync(file);
                const blob = new Blob([buffer]);

                const formData = new FormData();
                formData.append("file", blob, basename(file));
                formData.append("model", opts.model);
                if (opts.language) formData.append("language", opts.language);

                const res = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}` },
                    body: formData,
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, text);
                    if (hint) {
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(`${res.status}: ${text}`);
                }

                const data = (await res.json()) as { text: string };

                if (getOutputMode() === "json") {
                    printResult(data);
                } else {
                    process.stdout.write(`${data.text}\n`);
                }
            } catch (err) {
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}
