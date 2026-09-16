import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { BASE_URL } from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";

interface UsageRecord {
    timestamp: string;
    type: string;
    model: string;
    cost_usd: number;
    meter_source: string;
    api_key?: string;
    api_key_id?: string;
    input_text_tokens?: number;
    input_cached_tokens?: number;
    input_audio_tokens?: number;
    input_image_tokens?: number;
    output_text_tokens?: number;
    output_reasoning_tokens?: number;
    output_audio_tokens?: number;
    output_image_tokens?: number;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    model: string;
    meter_source: string;
    requests: number;
    cost_usd: number;
}

interface DailyUsageResponse {
    usage: DailyUsageRecord[];
    count: number;
}

interface BalanceResponse {
    balance: number;
}

interface KeyInfo {
    id: string;
    name: string;
}

const num = (value: number | undefined) =>
    typeof value === "number" ? value : 0;

/** Every input-token column the usage rows carry. */
export const tokensIn = (row: Partial<UsageRecord>): number =>
    num(row.input_text_tokens) +
    num(row.input_cached_tokens) +
    num(row.input_audio_tokens) +
    num(row.input_image_tokens);

/** Every output-token column the usage rows carry. */
export const tokensOut = (row: Partial<UsageRecord>): number =>
    num(row.output_text_tokens) +
    num(row.output_reasoning_tokens) +
    num(row.output_audio_tokens) +
    num(row.output_image_tokens);

/**
 * Near matches for an unknown --key query: the name contains the query
 * (case-insensitive), the query contains the name, or the id starts with it.
 */
export const nearMatches = (keys: KeyInfo[], query: string): KeyInfo[] => {
    const q = query.toLowerCase();
    return keys.filter(
        (k) =>
            k.name.toLowerCase().includes(q) ||
            q.includes(k.name.toLowerCase()) ||
            k.id.toLowerCase().startsWith(q),
    );
};

/** Resolve --key name-or-id queries to API key ids via /account/keys. */
export const resolveKeyIds = (
    keys: KeyInfo[],
    queries: string[],
): { ids: string[]; unknown: string[] } => {
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const query of queries) {
        const match = keys.find((k) => k.name === query || k.id === query);
        if (match) {
            if (!ids.includes(match.id)) ids.push(match.id);
        } else {
            unknown.push(query);
        }
    }
    return { ids, unknown };
};

export interface UsageQueryParams {
    limit?: number;
    apiKeyIds?: string[];
    models?: string[];
    days?: number;
    csv?: boolean;
}

/** Build the /account/usage(+/daily) query string from the filters. */
export const usageQuery = (params: UsageQueryParams): string => {
    const search = new URLSearchParams();
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.apiKeyIds?.length)
        search.set("api_key_ids", params.apiKeyIds.join(","));
    if (params.models?.length) search.set("models", params.models.join(","));
    if (params.days !== undefined) search.set("days", String(params.days));
    if (params.csv) search.set("format", "csv");
    return search.toString();
};

/** The endpoints return raw CSV for format=csv; gen() parses JSON. */
export const fetchCsv = async (
    path: string,
    apiKey: string,
): Promise<string> => {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
};

const collect = (value: string, previous: string[]): string[] => [
    ...previous,
    value,
];

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    // NOTE: `--key <name-or-id>` (repeatable) is inherited from the program
    // option — commander shares the option store, so declaring it here again
    // would shadow the value. The action reads opts.key and splits it by
    // position (see below).
    .option("--model <id>", "Filter by model id (repeatable)", collect, [])
    .option("--days <n>", "Days to look back (history and daily)")
    .option("--csv", "Print the raw CSV export instead of a table")
    .action(async (opts) => {
        // `polli --key X <cmd>` authenticates with X; `polli usage --key <name>`
        // filters by key. Commander shares the option store between the program
        // and subcommands, so we read the --key values positionally from argv:
        // those before the command name authenticate, those after it filter.
        const key = requireKey();
        const argv = process.argv;
        const nameIdx = argv.indexOf("usage");
        const allKeyArgs: string[] = [];
        for (let i = 0; i < argv.length; i++) {
            if (argv[i] === "--key") allKeyArgs.push(argv[i + 1] ?? "");
            else if (argv[i]?.startsWith("--key="))
                allKeyArgs.push(argv[i].slice("--key=".length));
        }
        const keyQueries = allKeyArgs.filter(
            (q) => nameIdx === -1 || argv.indexOf(q) > nameIdx,
        );

        const hasFilters =
            keyQueries.length > 0 ||
            opts.model.length > 0 ||
            opts.days !== undefined ||
            opts.csv;
        if (hasFilters && !opts.history && !opts.daily) {
            printError("Filters apply to --history or --daily");
            process.exit(1);
        }

        try {
            // Default: show balance (unless --history or --daily)
            if (!opts.history && !opts.daily) {
                const data = await gen<BalanceResponse>("/account/balance", {
                    apiKey: key,
                });
                if (getOutputMode() !== "human") {
                    printResult({ pollen: data.balance });
                    return;
                }
                const bal = data.balance;
                let color = chalk.green;
                if (bal <= 0) color = chalk.red;
                else if (bal < 1) color = chalk.yellow;
                printResult({ pollen: color(String(bal)) });
                return;
            }

            let apiKeyIds: string[] = [];
            if (keyQueries.length > 0) {
                const data = await gen<{ data: KeyInfo[] }>("/account/keys", {
                    apiKey: key,
                });
                const keys = data.data ?? [];
                const resolved = resolveKeyIds(keys, keyQueries);
                if (resolved.unknown.length > 0) {
                    const hints = resolved.unknown.map((query) => {
                        const near = nearMatches(keys, query);
                        const names = near.length
                            ? near.map((k) => k.name).join(", ")
                            : "none — see `polli keys list`";
                        return `"${query}" (near matches: ${names})`;
                    });
                    printError(`Unknown API key(s): ${hints.join("; ")}`);
                    process.exit(1);
                }
                apiKeyIds = resolved.ids;
            }

            let days: number | undefined;
            if (opts.days !== undefined) {
                days = Number(opts.days);
                if (!Number.isInteger(days) || days < 1) {
                    printError("--days must be a positive integer");
                    process.exit(1);
                }
            }

            if (opts.daily) {
                const dailyQuery = usageQuery({
                    apiKeyIds,
                    models: opts.model ?? [],
                    days,
                    csv: opts.csv,
                });
                if (opts.csv) {
                    process.stdout.write(
                        await fetchCsv(
                            `/account/usage/daily?${dailyQuery}`,
                            key,
                        ),
                    );
                    return;
                }
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily?${dailyQuery}`,
                    { apiKey: key },
                );
                printTable(
                    data.usage.map((r) => ({
                        date: r.date,
                        model: r.model,
                        requests: r.requests,
                        cost:
                            r.cost_usd != null
                                ? `$${r.cost_usd.toFixed(4)}`
                                : "-",
                        source: r.meter_source,
                    })),
                );
                return;
            }

            const limit = Number(opts.limit);
            if (!Number.isInteger(limit) || limit < 1) {
                printError("--limit must be a positive integer");
                process.exit(1);
            }
            const query = usageQuery({
                limit,
                apiKeyIds,
                models: opts.model ?? [],
                days,
                csv: opts.csv,
            });
            if (opts.csv) {
                process.stdout.write(
                    await fetchCsv(`/account/usage?${query}`, key),
                );
                return;
            }
            const data = await gen<UsageResponse>(`/account/usage?${query}`, {
                apiKey: key,
            });
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    type: r.type,
                    model: r.model,
                    in: tokensIn(r),
                    out: tokensOut(r),
                    cost:
                        r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "-",
                    key: r.api_key ?? "-",
                    source: r.meter_source,
                })),
            );
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
