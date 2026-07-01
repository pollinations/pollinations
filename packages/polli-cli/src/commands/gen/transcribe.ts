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
import { t } from "../../lib/i18n.js";
import { startSpinner, stopSpinner } from "../../lib/spinner.js";
import { TranscribeOptionsSchema } from "../../lib/validation.js";
import { logActivity } from "../../lib/logger.js";

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
        .addHelpText("after", `
Examples:
  polli gen transcribe recording.mp3
  polli gen transcribe speech.wav --model universal-2 --language fr
  polli gen transcribe meeting.mp3 --json
        `)
        .action(async (file, opts) => {
            const key = await requireKey();
            const isHuman = getOutputMode() === "human";

            const validation = TranscribeOptionsSchema.safeParse(opts);
            if (!validation.success) {
                printError(`Invalid options: ${validation.error.message}`);
                process.exit(1);
            }
            const validOpts = validation.data;

            if (isHuman) startSpinner(t("gen.generating", { type: "transcription" }));

            try {
                const buffer = readFileSync(file);
                const blob = new Blob([buffer]);
                const formData = new FormData();
                formData.append("file", blob, basename(file));
                formData.append("model", validOpts.model);
                if (validOpts.language) formData.append("language", validOpts.language);

                const res = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}` },
                    body: formData,
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, text);
                    if (hint) {
                        stopSpinner(false);
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(`${res.status}: ${text}`);
                }
                const data = (await res.json()) as { text: string };
                stopSpinner(true);
                if (getOutputMode() === "json") {
                    printResult(data);
                } else {
                    process.stdout.write(`${data.text}\n`);
                }
                logActivity("gen_transcribe", {
                    file,
                    model: validOpts.model,
                    language: validOpts.language,
                    textLength: data.text.length,
                });
            } catch (err) {
                stopSpinner(false);
                printError(
                    err instanceof Error ? err.message : "unknown error",
                );
                process.exit(1);
            }
        });
}