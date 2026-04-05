import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { printError, printTable } from "../lib/output.js";
import { showModelStats } from "./stats.js";

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
    voices?: string[];
}

function classifyType(m: ModelEntry): string {
    const out = m.output_modalities ?? [];
    if (out.includes("video")) return "video";
    if (out.includes("audio")) return "audio";
    if (out.includes("image")) return "image";
    if (out.includes("text")) return "text";
    return "unknown";
}

function capabilities(m: ModelEntry): string {
    const caps: string[] = [];
    if (m.tools) caps.push("tools");
    if (m.reasoning) caps.push("reasoning");
    if (m.input_modalities?.includes("image")) caps.push("vision");
    if (m.voices && m.voices.length > 0) caps.push("voices");
    if (m.paid_only) caps.push("paid");
    return caps.join(",") || "-";
}

function buildRow(m: ModelEntry, mType: string, verbose: boolean) {
    const row: Record<string, unknown> = {
        name: m.name,
        type: mType,
        capabilities: capabilities(m),
        description: m.description ?? "-",
    };
    if (verbose) {
        row.context = m.context_length
            ? `${Math.round(m.context_length / 1000)}k`
            : "-";
    }
    return row;
}

export const modelsCommand = new Command("models")
    .description("List available models or show model health stats")
    .option("--type <type>", "Filter: text, image, audio, video, all", "all")
    .option("--verbose", "Show additional details (context length)")
    .option("--stats", "Show model health and performance stats")
    .option("--window <window>", "Stats time window: 5m, 60m, 24h, 7d", "60m")
    .action(async (opts) => {
        if (opts.stats) {
            try {
                await showModelStats(opts.type, opts.window);
            } catch (err) {
                printError(
                    `Failed to fetch stats: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
            return;
        }

        requireKey();
        const type = opts.type as string;
        const verbose = !!opts.verbose;
        const rows: Record<string, unknown>[] = [];

        try {
            if (type === "all" || type === "image" || type === "video") {
                const imageModels = await gen<ModelEntry[]>("/image/models", {
                    timeout: 15_000,
                });
                for (const m of imageModels) {
                    const mType = classifyType(m);
                    if (type !== "all" && mType !== type) continue;
                    rows.push(buildRow(m, mType, verbose));
                }
            }

            if (type === "all" || type === "text") {
                const textModels = await gen<ModelEntry[]>("/text/models", {
                    timeout: 15_000,
                });
                for (const m of textModels) {
                    rows.push(buildRow(m, "text", verbose));
                }
            }

            if (type === "all" || type === "audio") {
                const audioModels = await gen<ModelEntry[]>("/audio/models", {
                    timeout: 15_000,
                });
                for (const m of audioModels) {
                    rows.push(buildRow(m, "audio", verbose));
                }
            }

            const cols = verbose
                ? ["name", "type", "capabilities", "context", "description"]
                : ["name", "type", "capabilities", "description"];
            printTable(rows, cols);
        } catch (err) {
            printError(
                `Failed to fetch models: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
