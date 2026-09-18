import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";
import { parseDaysWindow } from "./earnings.js";

interface UsageRecord {
    timestamp: string;
    type: string;
    model: string | null;
    api_key: string | null;
    meter_source: string | null;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_image_tokens: number;
    cost_usd: number;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    api_key: string | null;
    model: string | null;
    meter_source: string | null;
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

interface KeyRef {
    id: string;
    name: string;
}

/** Input/output token totals across modalities (duration columns excluded). */
export const sumTokens = (r: UsageRecord) => ({
    in:
        r.input_text_tokens +
        r.input_cached_tokens +
        r.input_audio_tokens +
        r.input_image_tokens,
    out:
        r.output_text_tokens +
        r.output_reasoning_tokens +
        r.output_audio_tokens +
        r.output_image_tokens,
});

/** Match a --key argument: exact key id first, then exact name (case-insensitive). */
export const matchKeyRef = (keys: KeyRef[], ref: string): KeyRef | undefined =>
    keys.find((k) => k.id === ref) ??
    keys.find((k) => k.name.toLowerCase() === ref.toLowerCase());

/** Keys whose name contains the reference or whose id starts with it. */
export const nearKeyMatches = (keys: KeyRef[], ref: string): KeyRef[] => {
    const needle = ref.toLowerCase();
    return keys.filter(
        (k) =>
            k.name.toLowerCase().includes(needle) ||
            k.id.toLowerCase().startsWith(needle),
    );
};

const resolveKeyIds = async (
    refs: string[],
    apiKey: string,
): Promise<string[]> => {
    const { data } = await gen<{ data: KeyRef[] }>("/account/keys", { apiKey });
    const ids: string[] = [];
    for (const ref of refs) {
        const match = matchKeyRef(data, ref);
        if (!match) {
            const near = nearKeyMatches(data, ref);
            const suggestions = (near.length > 0 ? near : data).map(
                (k) => k.name,
            );
            const list =
                suggestions.length > 0
                    ? suggestions.slice(0, 10).join(", ")
                    : "none found";
            printError(`Unknown key "${ref}". Keys: ${list}`);
            process.exit(1);
        }
        ids.push(match.id);
    }
    return ids;
};

/** Build a query string from parts, dropping undefined and empty values. */
const buildQuery = (parts: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(parts)) {
        if (value) params.set(name, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
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
    .option(
        "--key <key>",
        "Filter by API key name or id (repeatable)",
        collect,
        [] as string[],
    )
    .option(
        "--model <model>",
        "Filter by model id (repeatable)",
        collect,
        [] as string[],
    )
    .option("--days <n>", "Rolling window in days, max 90")
    .option("--csv", "Print the raw CSV export instead of a table")
    .action(async (opts) => {
        const key = requireKey();

        let days: number | undefined;
        if (opts.days !== undefined) {
            try {
                days = parseDaysWindow(opts.days);
            } catch (err) {
                printError(
                    err instanceof Error ? err.message : "Invalid --days value",
                );
                process.exit(1);
            }
        }

        try {
            // Default: show balance (unless --history or --daily)
            if (!opts.history && !opts.daily) {
                if (
                    opts.key.length > 0 ||
                    opts.model.length > 0 ||
                    opts.days !== undefined ||
                    opts.csv
                ) {
                    printError(
                        "--key, --model, --days and --csv require --history or --daily",
                    );
                    process.exit(1);
                }
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

            const apiKeyIds =
                opts.key.length > 0 ? await resolveKeyIds(opts.key, key) : [];

            if (opts.daily) {
                const path = `/account/usage/daily${buildQuery({
                    format: opts.csv ? "csv" : undefined,
                    api_key_ids: apiKeyIds.join(","),
                    days: days?.toString(),
                })}`;
                if (opts.csv) {
                    process.stdout.write(
                        await gen<string>(path, { apiKey: key, raw: true }),
                    );
                    return;
                }
                const data = await gen<DailyUsageResponse>(path, {
                    apiKey: key,
                });
                // The daily endpoint filters by key server-side only; model
                // rows are per-model, so filtering locally is exact.
                const usage =
                    opts.model.length > 0
                        ? data.usage.filter(
                              (r) =>
                                  r.model != null &&
                                  opts.model.includes(r.model),
                          )
                        : data.usage;
                printTable(
                    usage.map((r) => ({
                        date: r.date,
                        key: r.api_key,
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
            const path = `/account/usage${buildQuery({
                format: opts.csv ? "csv" : undefined,
                limit: String(limit),
                api_key_ids: apiKeyIds.join(","),
                models: opts.model.join(","),
                days: days?.toString(),
            })}`;
            if (opts.csv) {
                process.stdout.write(
                    await gen<string>(path, { apiKey: key, raw: true }),
                );
                return;
            }
            const data = await gen<UsageResponse>(path, { apiKey: key });
            printTable(
                data.usage.map((r) => {
                    const tokens = sumTokens(r);
                    return {
                        time: r.timestamp,
                        type: r.type,
                        model: r.model,
                        key: r.api_key,
                        in: tokens.in,
                        out: tokens.out,
                        cost:
                            r.cost_usd != null
                                ? `$${r.cost_usd.toFixed(4)}`
                                : "-",
                        source: r.meter_source,
                    };
                }),
            );
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
