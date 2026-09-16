import chalk from "chalk";
import { Command } from "commander";
import { gen, genText, requireKey } from "../lib/api.js";
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
    api_key: string | null;
    cost_usd: number;
    meter_source: string;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_image_tokens: number;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    model: string;
    api_key: string | null;
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

interface KeySummary {
    id: string;
    name: string;
}

export const MAX_USAGE_DAYS = 90;

export function tokensIn(r: {
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_image_tokens: number;
}): number {
    return (
        r.input_text_tokens +
        r.input_cached_tokens +
        r.input_audio_tokens +
        r.input_image_tokens
    );
}

export function tokensOut(r: {
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_image_tokens: number;
}): number {
    return (
        r.output_text_tokens +
        r.output_reasoning_tokens +
        r.output_audio_tokens +
        r.output_image_tokens
    );
}

export function parseUsageDays(value: string): number {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error("--days must be a positive integer");
    }
    if (days > MAX_USAGE_DAYS) {
        throw new Error(`--days must be ${MAX_USAGE_DAYS} or less`);
    }
    return days;
}

/** Resolve --for-key values (names or ids) to key ids. Ids pass through unchanged. */
export function resolveKeyIds(
    values: string[],
    keys: KeySummary[],
): { ids: string[] } | { error: string } {
    const idSet = new Set(keys.map((k) => k.id));
    const byName = new Map(keys.map((k) => [k.name.toLowerCase(), k.id]));
    const ids: string[] = [];

    for (const value of values) {
        if (idSet.has(value)) {
            ids.push(value);
            continue;
        }
        const idByName = byName.get(value.toLowerCase());
        if (idByName) {
            ids.push(idByName);
            continue;
        }
        const needle = value.toLowerCase();
        const near = keys
            .map((k) => k.name)
            .filter((name) => name.toLowerCase().includes(needle))
            .slice(0, 5);
        const suggestion =
            near.length > 0 ? ` Did you mean: ${near.join(", ")}?` : "";
        return { error: `Unknown key "${value}".${suggestion}` };
    }

    return { ids };
}

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
    .option("--days <n>", `Days to include, max ${MAX_USAGE_DAYS}`)
    .option(
        "--for-key <name-or-id>",
        "Filter by API key name or id (repeatable). Distinct from the global --key auth override.",
        collect,
        [],
    )
    .option("--model <id>", "Filter by model id (repeatable)", collect, [])
    .option("--csv", "Export as CSV instead of a table")
    .action(async (opts) => {
        const key = requireKey();

        let days: number | undefined;
        if (opts.days !== undefined) {
            try {
                days = parseUsageDays(opts.days);
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
            if (opts.forKey.length > 0) {
                const keysRes = await gen<{ data: KeySummary[] }>(
                    "/account/keys",
                    { apiKey: key },
                );
                const resolved = resolveKeyIds(opts.forKey, keysRes.data);
                if ("error" in resolved) {
                    printError(resolved.error);
                    process.exit(1);
                }
                apiKeyIds = resolved.ids;
            }

            if (opts.daily) {
                const params = new URLSearchParams();
                if (days !== undefined) params.set("days", String(days));
                if (apiKeyIds.length > 0)
                    params.set("api_key_ids", apiKeyIds.join(","));

                if (opts.csv) {
                    params.set("format", "csv");
                    const csv = await genText(
                        `/account/usage/daily?${params}`,
                        { apiKey: key },
                    );
                    process.stdout.write(csv);
                    return;
                }

                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily?${params}`,
                    { apiKey: key },
                );
                const rows =
                    opts.model.length > 0
                        ? data.usage.filter(
                              (r) =>
                                  r.model != null &&
                                  opts.model.includes(r.model),
                          )
                        : data.usage;
                printTable(
                    rows.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? "-",
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
            const params = new URLSearchParams({ limit: String(limit) });
            if (days !== undefined) params.set("days", String(days));
            if (apiKeyIds.length > 0)
                params.set("api_key_ids", apiKeyIds.join(","));
            if (opts.model.length > 0)
                params.set("models", opts.model.join(","));

            if (opts.csv) {
                params.set("format", "csv");
                const csv = await genText(`/account/usage?${params}`, {
                    apiKey: key,
                });
                process.stdout.write(csv);
                return;
            }

            const data = await gen<UsageResponse>(`/account/usage?${params}`, {
                apiKey: key,
            });
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    type: r.type,
                    model: r.model,
                    key: r.api_key ?? "-",
                    tokens_in: tokensIn(r),
                    tokens_out: tokensOut(r),
                    cost:
                        r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "-",
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
