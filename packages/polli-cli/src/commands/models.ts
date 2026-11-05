import chalk from "chalk";
import { Command, Option } from "commander";
import { gen } from "../lib/api.js";
import {
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";
import { fetchModelStats } from "./stats.js";

const MAX_STATS_WINDOW_MINUTES = 7 * 24 * 60;

interface ModelEntry {
    name: string;
    category?: string;
    publisher?: string;
    description?: string;
    community?: boolean;
    input_modalities?: string[];
    pricing?: Record<string, string>;
    capabilities?: string[];
    context_length?: number;
    paid_only?: boolean;
    voices?: string[];
    video_capabilities?: string[];
}

function capabilities(m: ModelEntry): string {
    const caps = [...(m.capabilities ?? [])];
    if (m.input_modalities?.includes("image")) caps.push("vision");
    if (m.video_capabilities?.length) caps.push(...m.video_capabilities);
    if (m.voices?.length) caps.push("voices");
    if (m.paid_only) caps.push(chalk.dim("paid"));
    if (m.community) caps.push(chalk.cyan("community"));
    return caps.join(",") || "-";
}

function buildRow(m: ModelEntry, verbose: boolean) {
    const name = chalk.level > 0 ? chalk.hex("#a78bfa").bold(m.name) : m.name;
    // Keep full description intact so pipes and redirects preserve data.
    // printTable handles TTY-aware truncation of the last column.
    const row: Record<string, unknown> = {
        name,
        type: m.category ?? "-",
        capabilities: capabilities(m),
        description: m.description ?? "-",
        pricing: m.pricing ?? null,
    };
    if (verbose) {
        row.publisher = m.publisher ?? "-";
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
    .description(
        "List available models and their voices, or show model health stats",
    )
    .argument(
        "[query]",
        "Search names, aliases, titles, descriptions and publishers",
    )
    .addOption(
        new Option("--type <type>", "Filter by type")
            .choices([
                "text",
                "decision",
                "image",
                "audio",
                "video",
                "3d",
                "embedding",
                "realtime",
                "all",
            ])
            .default("all"),
    )
    .addOption(
        new Option(
            "--source <source>",
            "Only official or community models",
        ).choices(["official", "community"]),
    )
    .addOption(
        new Option(
            "--reliability <level>",
            "all also lists community models failing health checks",
        ).choices(["reliable", "all"]),
    )
    .option("--voices", "List each model's voices")
    .option(
        "--verbose",
        "Show additional details (publisher, context length, pricing)",
    )
    .option("--stats", "Show model health stats (err% column counts 5xx only)")
    .option(
        "--window <minutes>",
        `Stats window in minutes (1-${MAX_STATS_WINDOW_MINUTES})`,
        "60",
    )
    .action(async (query: string | undefined, opts) => {
        if (opts.stats) {
            try {
                const windowMinutes = Number(opts.window);
                if (
                    !Number.isInteger(windowMinutes) ||
                    windowMinutes < 1 ||
                    windowMinutes > MAX_STATS_WINDOW_MINUTES
                ) {
                    fail(
                        `--window must be an integer between 1 and ${MAX_STATS_WINDOW_MINUTES}`,
                    );
                }

                const rows = await fetchModelStats(windowMinutes);
                const wantType = opts.type as string;
                // Decision models record text events, so match them by name.
                const decisionNames =
                    wantType === "decision"
                        ? new Set(
                              (await gen<ModelEntry[]>("/text/models"))
                                  .filter((m) => m.category === "decision")
                                  .map((m) => m.name),
                          )
                        : undefined;
                const valid = rows.filter((r) => {
                    if (r.model === "undefined") return false;
                    if (Number(r.total_requests ?? 0) <= 1) return false;
                    if (wantType === "all") return true;
                    if (decisionNames)
                        return decisionNames.has(String(r.model));
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
                fail("Failed to fetch stats", err);
            }
            return;
        }

        // Search, source and reliability are /models query parameters.
        const params = new URLSearchParams();
        if (query) params.set("query", query);
        if (opts.source) params.set("source", opts.source);
        if (opts.reliability) params.set("reliability", opts.reliability);

        try {
            const models = (
                await gen<ModelEntry[]>(`/models?${params}`)
            ).filter(
                (m) =>
                    (opts.type === "all" || m.category === opts.type) &&
                    (!opts.voices || m.voices?.length),
            );

            if (getOutputMode() === "json") {
                printResult(models);
                return;
            }

            if (opts.voices) {
                // "model: voices" lines; voice lists overflow a table column.
                if (models.length === 0) printInfo("No results.");
                else
                    printResult(
                        Object.fromEntries(
                            models.map((m) => [m.name, m.voices?.join(", ")]),
                        ),
                    );
                return;
            }

            const rows = models.map((m) => buildRow(m, !!opts.verbose));
            const cols = opts.verbose
                ? [
                      "name",
                      "type",
                      "publisher",
                      "capabilities",
                      "context",
                      "pricing",
                      "description",
                  ]
                : ["name", "type", "capabilities", "description"];
            printTable(rows, cols);
        } catch (err) {
            fail("Failed to fetch models", err);
        }
    });
