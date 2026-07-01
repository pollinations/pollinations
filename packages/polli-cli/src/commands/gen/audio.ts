import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { requireKey } from "../../lib/api.js";
import { BASE_URL } from "../../lib/config.js";
import { budgetHint } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
    printWarn,
    printDebug,
} from "../../lib/output.js";
import { playAudio, playerMissingHint } from "../../lib/play.js";
import { readStdin } from "../../lib/stdin.js";
import { t } from "../../lib/i18n.js";
import { startSpinner, stopSpinner } from "../../lib/spinner.js";
import { AudioGenOptionsSchema } from "../../lib/validation.js";
import { logActivity } from "../../lib/logger.js";
import { getDefaultModel, getDefaultVoice, getDefaultFormat } from "../../lib/config-store.js";
import { getCachedModels } from "../../lib/cache.js";

export function createAudioCommand() {
    return new Command("audio")
        .description(
            "Generate speech or music from text (stdin ok). Discover voices: polli models --type audio --json | jq '.[].voices'",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen audio "hello world" --play\n  echo "the sky today" | polli gen audio --voice callum --play\n  polli gen audio --model elevenmusic --duration 30 "lofi beats" --output song.mp3\n  polli gen audio "read this" --background --play\n`,
        )
        .argument("[text]", "Text to speak (or pipe via stdin)")
        .option("--voice <voice>", "Voice name", getDefaultVoice())
        .option("--format <fmt>", "mp3/opus/aac/flac/wav", getDefaultFormat())
        .option("--model <model>", "Audio model", getDefaultModel("audio"))
        .option("--speed <n>", "Playback speed (0.25-4)")
        .option("--duration <n>", "Music duration in seconds (elevenmusic)")
        .option("--instrumental", "Instrumental only (elevenmusic)")
        .option("--seed <n>", "Seed for deterministic output")
        .option("--output <path>", "Save to file", "speech.mp3")
        .option("--play", "Play the audio after saving (platform player)")
        .option("--background", "Play in background (non-blocking)")
        .action(async (textArg, opts) => {
            const key = await requireKey();
            const isHuman = getOutputMode() === "human";

            // Validate options
            const validation = AudioGenOptionsSchema.safeParse(opts);
            if (!validation.success) {
                printError(`Invalid options: ${validation.error.message}`);
                process.exit(1);
            }
            const validOpts = validation.data;

            const inputText = textArg || (await readStdin());
            if (!inputText) {
                printError(t("gen.no_input", { type: "text" }));
                process.exit(1);
            }

            // Validate model exists
            const models = getCachedModels<Array<{ name: string; output_modalities?: string[] }>>();
            if (models && validOpts.model) {
                const found = models.find((m) => m.name === validOpts.model);
                if (!found) {
                    printWarn(`Model "${validOpts.model}" not found in cache. It may not exist.`);
                } else if (!found.output_modalities?.includes("audio")) {
                    printWarn(`Model "${validOpts.model}" may not support audio generation.`);
                }
            }

            const params = new URLSearchParams({
                voice: validOpts.voice,
            });
            if (validOpts.format !== "mp3")
                params.set("response_format", validOpts.format);
            if (validOpts.model) params.set("model", validOpts.model);
            if (validOpts.speed) params.set("speed", String(validOpts.speed));
            if (validOpts.duration) params.set("duration", String(validOpts.duration));
            if (validOpts.instrumental) params.set("instrumental", "true");
            if (validOpts.seed) params.set("seed", String(validOpts.seed));

            const encodedText = encodeURIComponent(inputText);
            const url = `${BASE_URL}/audio/${encodedText}?${params}`;

            if (isHuman) {
                startSpinner(t("gen.generating", { type: "audio" }));
            }
            printDebug(`Request URL: ${url}`);

            try {
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${key}` },
                });
                if (!res.ok) {
                    const errText = await res.text().catch(() => "");
                    const hint = await budgetHint(res.status, errText);
                    if (hint) {
                        stopSpinner(false);
                        printError(hint);
                        process.exit(1);
                    }
                    throw new Error(
                        `${res.status} ${res.statusText}: ${errText}`,
                    );
                }
                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(validOpts.output, buffer);
                stopSpinner(true, t("gen.saved", { path: validOpts.output }));
                printMeta({
                    path: validOpts.output,
                    size: buffer.length,
                    voice: validOpts.voice,
                    model: validOpts.model ?? "default",
                });

                if (validOpts.play) {
                    if (isHuman) printInfo(t("gen.playing"));
                    const ok = await playAudio(validOpts.output, validOpts.background);
                    if (!ok) printWarn(playerMissingHint());
                }
                logActivity("gen_audio", {
                    text: inputText.slice(0, 100),
                    voice: validOpts.voice,
                    model: validOpts.model,
                    output: validOpts.output,
                    size: buffer.length,
                    played: validOpts.play,
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