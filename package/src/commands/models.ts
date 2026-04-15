import chalk from "chalk";
import { Command } from "commander";
import { gen } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";
import { fetchModelStats } from "./stats.js";

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
    if (m.voices?.length) caps.push("voices");
    if (m.paid_only) caps.push(chalk.dim("paid"));
    return caps.join(",") || "-";
}

function buildRow(m: ModelEntry, mType: string, verbose: boolean) {
    const row: Record<string, unknown> = {
        name: m.name,
        type: mType,
        capabilities: capabilities(m),
        description: m.description ?? "-",
        pricing: m.pricing ?? null,
    };
    if (verbose) {
        row.context = m.context_length
            ? `${Math.round(m.context_length / 1000)}k`
            : "-";
        row.pricing = m.pricing
            ? Object.entries(m.pricing)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ")
            : "-";
    }
    return row;
}

export const modelsCommand = new Command("models")
    .description("List available models or show model health stats")
    .option("--type <type>", "Filter: text, image, audio, video, all", "all")
    .option("--verbose", "Show additional details (context length)")
    .option("--stats", "Show model health stats (err% column counts 5xx only)")
    .option("--window <minutes>", "Stats window in minutes", "60")
    .action(async (opts) => {
        if (opts.stats) {
            try {
                const rows = await fetchModelStats(Number(opts.window));
                const wantType = opts.type as string;
                const valid = rows.filter((r) => {
                    if (r.model === "undefined") return false;
                    if (Number(r.total_requests ?? 0) <= 1) return false;
                    if (wantType === "all") return true;
                    const t = String(r.event_type ?? "").replace(
                        "generate.",
                        "",
                    );
                    return t === wantType;
                });
                if (getOutputMode() === "json") {
                    printResult(valid);
                } else {
                    const curated = valid.map((r) => {
                        const total = Number(r.total_requests ?? 0);
                        const errs5xx = Number(r.errors_5xx ?? 0);
                        const errPct = (errs5xx / total) * 100;
                        const avg = Number(r.avg_latency_ms ?? 0);
                        let errStr = `${errPct.toFixed(1)}%`;
                        if (errPct > 5) errStr = chalk.red(errStr);
                        else if (errPct > 1) errStr = chalk.yellow(errStr);
                        return {
                            model: String(r.model ?? "-"),
                            type: String(r.event_type ?? "").replace(
                                "generate.",
                                "",
                            ),
                            requests: total,
                            "err%": errStr,
                            avg: `${(avg / 1000).toFixed(1)}s`,
                        };
                    });
                    printTable(curated);
                }
            } catch (err) {
                printError(
                    `Failed to fetch stats: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
            return;
        }

        const type = opts.type as string;
        const verbose = !!opts.verbose;

        try {
            const raw: { model: ModelEntry; type: string }[] = [];
            if (type === "all" || type === "image" || type === "video") {
                const imageModels = await gen<ModelEntry[]>("/image/models");
                for (const m of imageModels) {
                    const mType = classifyType(m);
                    if (type !== "all" && mType !== type) continue;
                    raw.push({ model: m, type: mType });
                }
            }
            if (type === "all" || type === "text") {
                const textModels = await gen<ModelEntry[]>("/text/models");
                for (const m of textModels)
                    raw.push({ model: m, type: "text" });
            }
            if (type === "all" || type === "audio") {
                const audioModels = await gen<ModelEntry[]>("/audio/models");
                for (const m of audioModels)
                    raw.push({ model: m, type: "audio" });
            }

            if (getOutputMode() === "json") {
                printResult(
                    raw.map(({ model, type: t }) => ({ ...model, type: t })),
                );
                return;
            }

            const rows = raw.map(({ model, type: t }) =>
                buildRow(model, t, verbose),
            );
            const cols = verbose
                ? [
                      "name",
                      "type",
                      "capabilities",
                      "context",
                      "pricing",
                      "description",
                  ]
                : ["name", "type", "capabilities", "description"];
            printTable(rows, cols);
        } catch (err) {
            printError(
                `Failed to fetch models: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
