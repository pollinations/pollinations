import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { resolveModel } from "../lib/config.js";
import { printError, printTable } from "../lib/output.js";

interface ModelEntry {
    name: string;
    description?: string;
    output_modalities?: string[];
    input_modalities?: string[];
    pricing?: Record<string, string>;
    tools?: boolean;
    reasoning?: boolean;
    context_length?: number;
    paid_only?: boolean;
}

function classifyType(m: ModelEntry): string {
    const out = m.output_modalities ?? [];
    if (out.includes("video")) return "video";
    if (out.includes("audio")) return "audio";
    if (out.includes("image")) return "image";
    if (out.includes("text")) return "text";
    return "unknown";
}

function markDefault(
    name: string,
    type: string,
    defaults: Record<string, string>,
): string {
    return name === defaults[type] ? `${name} *` : name;
}

export const modelsCommand = new Command("models")
    .description("List available models")
    .option("--type <type>", "Filter: text, image, audio, video, all", "all")
    .action(async (opts) => {
        requireKey();
        const type = opts.type as string;
        const rows: Record<string, unknown>[] = [];

        const defaults: Record<string, string> = {
            text: resolveModel("text"),
            image: resolveModel("image"),
            audio: resolveModel("audio"),
            video: resolveModel("video"),
        };

        try {
            // /image/models returns image + video models with full metadata
            if (type === "all" || type === "image" || type === "video") {
                const imageModels = await gen<ModelEntry[]>("/image/models", {
                    timeout: 15_000,
                });
                for (const m of imageModels) {
                    const mType = classifyType(m);
                    if (type !== "all" && mType !== type) continue;
                    rows.push({
                        name: markDefault(m.name, mType, defaults),
                        type: mType,
                        description: m.description ?? "-",
                    });
                }
            }

            // /text/models returns text models with pricing
            if (type === "all" || type === "text") {
                const textModels = await gen<ModelEntry[]>("/text/models", {
                    timeout: 15_000,
                });
                for (const m of textModels) {
                    rows.push({
                        name: markDefault(m.name, "text", defaults),
                        type: "text",
                        description: m.description ?? "-",
                    });
                }
            }

            // /audio/models returns TTS, music, and STT models
            if (type === "all" || type === "audio") {
                const audioModels = await gen<ModelEntry[]>("/audio/models", {
                    timeout: 15_000,
                });
                for (const m of audioModels) {
                    rows.push({
                        name: markDefault(m.name, "audio", defaults),
                        type: "audio",
                        description: m.description ?? "-",
                    });
                }
            }

            printTable(rows, ["name", "type", "description"]);
        } catch (err) {
            printError(
                `Failed to fetch models: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
