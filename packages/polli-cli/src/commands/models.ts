import chalk from "chalk";
import { Command } from "commander";
import { gen } from "../lib/api.js";
import {
    ExitSignal,
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";
import { fetchModelStats } from "./stats.js";

const MAX_STATS_WINDOW_MINUTES = 7 * 24 * 60;
const accent = (s: string) => chalk.hex("#a78bfa").bold(s);

export interface ModelEntry {
    name: string;
    title?: string;
    category?: string;
    publisher?: string;
    description?: string;
    community?: boolean;
    aliases?: string[];
    output_modalities?: string[];
    input_modalities?: string[];
    pricing?: Record<string, string>;
    capabilities?: string[];
    context_length?: number;
    paid_only?: boolean;
    voices?: string[];
    video_capabilities?: string[];
}

export function classifyType(m: ModelEntry): string {
    if (m.category === "decision") return "decision";
    if (m.category === "realtime") return "realtime";
    const out = m.output_modalities ?? [];
    if (out.includes("3d") || m.category === "3d") return "3d";
    if (out.includes("video") || m.category === "video") return "video";
    if (out.includes("embedding") || m.category === "embedding")
        return "embedding";
    if (out.includes("audio") || m.category === "audio") return "audio";
    if (out.includes("image") || m.category === "image") return "image";
    if (out.includes("text") || m.category === "text") return "text";
    return m.category ?? "unknown";
}

export function capabilities(m: ModelEntry): string {
    const caps = [...(m.capabilities ?? [])];
    if (m.input_modalities?.includes("image")) caps.push("vision");
    if (m.video_capabilities?.length) caps.push(...m.video_capabilities);
    if (m.voices?.length) caps.push("voices");
    if (m.paid_only) caps.push(chalk.dim("paid"));
    if (m.community) caps.push(chalk.cyan("community"));
    return caps.join(",") || "-";
}

export function buildRow(m: ModelEntry, mType: string, verbose: boolean) {
    const row: Record<string, unknown> = {
        name: accent(m.name),
        type: mType,
        capabilities: capabilities(m),
        description: m.description ?? "-",
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

export function createModelsCommand(): Command {
    return new Command("models")
        .description(
            "List available models, discover voices, or show model health stats",
        )
        .argument(
            "[query]",
            "Search query to filter models by name, publisher, or description",
        )
        .option(
            "--type <type>",
            "Filter: text, decision, image, audio, video, 3d, embedding, realtime, all",
            "all",
        )
        .option(
            "--source <source>",
            "Filter by source: official, community, all",
            "all",
        )
        .option(
            "--official",
            "Show only official models (shortcut for --source official)",
        )
        .option(
            "--community",
            "Show only community models (shortcut for --source community)",
        )
        .option(
            "--reliability <level>",
            "Filter by reliability: reliable, all",
            "reliable",
        )
        .option(
            "--all",
            "Include all models (shortcut for --reliability all, including uncurated community models)",
        )
        .option("--search <query>", "Search query to filter models")
        .option("--voices", "List available voices across audio models")
        .option(
            "--verbose",
            "Show additional details (publisher, context length, pricing)",
        )
        .option(
            "--stats",
            "Show model health stats (err% column counts 5xx only)",
        )
        .option(
            "--window <minutes>",
            `Stats window in minutes (1-${MAX_STATS_WINDOW_MINUTES})`,
            "60",
        )
        .action(async (queryArg: string | undefined, opts) => {
            if (
                ![
                    "text",
                    "decision",
                    "image",
                    "audio",
                    "video",
                    "3d",
                    "embedding",
                    "realtime",
                    "all",
                ].includes(opts.type)
            ) {
                fail(
                    "--type must be one of: text, decision, image, audio, video, 3d, embedding, realtime, all",
                );
            }

            if (opts.official && opts.community) {
                fail("Cannot specify both --official and --community");
            }
            if (
                opts.official &&
                opts.source &&
                opts.source !== "official" &&
                opts.source !== "all"
            ) {
                fail(
                    `Conflicting source options: --official with --source ${opts.source}`,
                );
            }
            if (
                opts.community &&
                opts.source &&
                opts.source !== "community" &&
                opts.source !== "all"
            ) {
                fail(
                    `Conflicting source options: --community with --source ${opts.source}`,
                );
            }

            let source = opts.source as string;
            if (opts.official) source = "official";
            else if (opts.community) source = "community";

            if (
                source &&
                source !== "all" &&
                !["official", "community"].includes(source)
            ) {
                fail("--source must be one of: official, community, all");
            }

            if (
                opts.all &&
                opts.reliability &&
                opts.reliability !== "all" &&
                opts.reliability !== "reliable"
            ) {
                fail(
                    `Conflicting reliability options: --all with --reliability ${opts.reliability}`,
                );
            }

            const reliability = (opts.all ? "all" : opts.reliability) as string;
            if (reliability && !["reliable", "all"].includes(reliability)) {
                fail("--reliability must be one of: reliable, all");
            }

            if (
                opts.search &&
                queryArg &&
                opts.search.trim() !== queryArg.trim()
            ) {
                fail("Cannot specify both [query] argument and --search flag");
            }

            const query = (opts.search ?? queryArg)?.trim();

            if (opts.stats) {
                if (
                    opts.official ||
                    opts.community ||
                    (opts.source && opts.source !== "all") ||
                    opts.all ||
                    (opts.reliability && opts.reliability !== "reliable")
                ) {
                    fail(
                        "--stats cannot be combined with source or reliability filters",
                    );
                }

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

                try {
                    const rows = await fetchModelStats(windowMinutes);
                    const wantType = opts.type as string;
                    // Decision models record text events, so match them by name.
                    const decisionNames =
                        wantType === "decision"
                            ? new Set(
                                  (await gen<ModelEntry[]>("/models"))
                                      .filter(
                                          (m) => classifyType(m) === "decision",
                                      )
                                      .map((m) => m.name),
                              )
                            : undefined;
                    const needle = query?.toLowerCase();
                    const valid = rows.filter((r) => {
                        if (r.model === "undefined") return false;
                        if (Number(r.total_requests ?? 0) <= 1) return false;
                        if (
                            needle &&
                            !String(r.model).toLowerCase().includes(needle)
                        ) {
                            return false;
                        }
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
                    if (err instanceof ExitSignal) throw err;
                    fail("Failed to fetch stats", err);
                }
                return;
            }

            const type = opts.type as string;
            const verbose = !!opts.verbose;

            try {
                const params = new URLSearchParams();
                if (source && source !== "all") params.set("source", source);
                if (reliability && reliability !== "reliable") {
                    params.set("reliability", reliability);
                }
                if (query) params.set("query", query);

                const path = `/models${params.toString() ? `?${params}` : ""}`;
                const models = await gen<ModelEntry[]>(path);

                if (opts.voices) {
                    const withVoices = models.filter(
                        (m) =>
                            Array.isArray(m.voices) &&
                            m.voices.length > 0 &&
                            (type === "all" || classifyType(m) === type),
                    );

                    if (withVoices.length === 0) {
                        printInfo("No models with voices found.");
                        return;
                    }

                    if (getOutputMode() === "json") {
                        printResult(
                            withVoices.map((m) => ({
                                name: m.name,
                                publisher: m.publisher ?? null,
                                voices: m.voices,
                                community: m.community ?? false,
                            })),
                        );
                        return;
                    }

                    const rows = withVoices.map((m) => ({
                        model: accent(m.name),
                        count: m.voices?.length ?? 0,
                        voices: m.voices?.join(", ") ?? "-",
                    }));
                    printTable(rows, ["model", "count", "voices"]);
                    return;
                }

                const raw: { model: ModelEntry; type: string }[] = [];
                for (const m of models) {
                    const mType = classifyType(m);
                    if (type !== "all" && mType !== type) continue;
                    raw.push({ model: m, type: mType });
                }

                if (getOutputMode() === "json") {
                    printResult(
                        raw.map(({ model, type: t }) => ({
                            ...model,
                            type: t,
                        })),
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
                          "publisher",
                          "capabilities",
                          "context",
                          "pricing",
                          "description",
                      ]
                    : ["name", "type", "capabilities", "description"];
                printTable(rows, cols);
            } catch (err) {
                if (err instanceof ExitSignal) throw err;
                fail("Failed to fetch models", err);
            }
        });
}

export const modelsCommand = createModelsCommand();
