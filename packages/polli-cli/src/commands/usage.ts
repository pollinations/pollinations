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
    model: string | null;
    cost_usd: number;
    meter_source: string | null;
    api_key?: string | null;
    input_text_tokens?: number | null;
    input_cached_tokens?: number | null;
    input_audio_tokens?: number | null;
    input_image_tokens?: number | null;
    output_text_tokens?: number | null;
    output_reasoning_tokens?: number | null;
    output_audio_tokens?: number | null;
    output_image_tokens?: number | null;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    model: string | null;
    api_key?: string | null;
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

/** Minimal shape of a key as returned by /account/keys (`{ data: [...] }`). */
interface AccountKey {
    id: string;
    name: string;
}

const MAX_USAGE_DAYS = 90;

// better-auth mints API key ids as 32-char alphanumerics; anything else is a
// key name. An id is passed through without a /account/keys lookup, so keys
// that only hold `account:usage` can still filter by id.
const KEY_ID_RE = /^[a-zA-Z0-9]{32}$/;

export const isKeyId = (value: string): boolean => KEY_ID_RE.test(value);

export const parseUsageDays = (value: string): number => {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error("--days must be a positive integer");
    }
    if (days > MAX_USAGE_DAYS) {
        throw new Error(`--days must be ${MAX_USAGE_DAYS} or less`);
    }
    return days;
};

/**
 * Resolve --key values (names or ids) to key ids. 32-char alphanumeric values
 * pass through as ids; names resolve case-insensitively against the account's
 * key list. Unknown names throw with near matches instead of silently
 * returning an empty table. Ambiguous (duplicate) names list the matching ids.
 */
export const resolveKeyIds = (
    values: string[],
    keys: AccountKey[],
): string[] => {
    const ids: string[] = [];
    for (const value of values) {
        if (isKeyId(value)) {
            ids.push(value);
            continue;
        }
        const matches = keys.filter(
            (k) => k.name.toLowerCase() === value.toLowerCase(),
        );
        if (matches.length === 1) {
            ids.push(matches[0].id);
        } else if (matches.length > 1) {
            throw new Error(
                `Ambiguous key name "${value}" matches ids: ${matches
                    .map((k) => k.id)
                    .join(", ")}`,
            );
        } else {
            const needle = value.toLowerCase();
            const near = [
                ...new Set(
                    keys
                        .filter((k) => k.name.toLowerCase().includes(needle))
                        .map((k) => k.name),
                ),
            ].slice(0, 5);
            const tip =
                near.length > 0 ? ` Near matches: ${near.join(", ")}.` : "";
            throw new Error(`Unknown key name "${value}".${tip}`);
        }
    }
    return ids;
};

/** Sum the input token columns the usage endpoint reports. */
export const tokensIn = (r: UsageRecord): number =>
    (r.input_text_tokens ?? 0) +
    (r.input_cached_tokens ?? 0) +
    (r.input_audio_tokens ?? 0) +
    (r.input_image_tokens ?? 0);

/** Sum the output token columns the usage endpoint reports. */
export const tokensOut = (r: UsageRecord): number =>
    (r.output_text_tokens ?? 0) +
    (r.output_reasoning_tokens ?? 0) +
    (r.output_audio_tokens ?? 0) +
    (r.output_image_tokens ?? 0);

const formatCost = (cost: number | null): string =>
    cost != null ? `$${cost.toFixed(4)}` : "-";

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option(
        "--key <name-or-id>",
        "Filter by API key name or 32-char ID (repeatable)",
        (val: string, prev: string[]) => prev.concat([val]),
        [] as string[],
    )
    .option(
        "--model <name>",
        "Filter by model (repeatable)",
        (val: string, prev: string[]) => prev.concat([val]),
        [] as string[],
    )
    .option("--days <n>", `Rolling window in days, max ${MAX_USAGE_DAYS}`)
    .option("--limit <n>", "Number of records (history only)", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option("--csv", "Export raw CSV from the API")
    .action(async (opts) => {
        const key = requireKey();

        try {
            // Default: show balance (unless --history or --daily)
            if (!opts.history && !opts.daily) {
                const hasFilters =
                    opts.key.length > 0 ||
                    opts.model.length > 0 ||
                    opts.days != null ||
                    opts.csv;
                if (hasFilters) {
                    printError(
                        "--key, --model, --days, and --csv require --history or --daily",
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

            if (opts.history && opts.daily) {
                printError("--history and --daily are mutually exclusive");
                process.exit(1);
            }
            if (opts.csv && getOutputMode() === "json") {
                printError("--csv cannot be used with JSON output mode");
                process.exit(1);
            }

            let days: number | undefined;
            if (opts.days != null) {
                try {
                    days = parseUsageDays(opts.days);
                } catch (err) {
                    printError(
                        err instanceof Error
                            ? err.message
                            : "Invalid --days value",
                    );
                    process.exit(1);
                }
            }

            let keyIds: string[];
            try {
                // Ids pass through without a keys lookup; names need the list.
                const needsLookup = opts.key.some((v) => !isKeyId(v));
                const keys = needsLookup
                    ? ((
                          await gen<{ data: AccountKey[] }>("/account/keys", {
                              apiKey: key,
                          })
                      ).data ?? [])
                    : [];
                keyIds = resolveKeyIds(opts.key, keys);
            } catch (err) {
                printError(
                    err instanceof Error
                        ? err.message
                        : "Failed to resolve keys",
                );
                process.exit(1);
            }

            const params = new URLSearchParams();
            if (keyIds.length > 0) params.set("api_key_ids", keyIds.join(","));
            if (days !== undefined) params.set("days", String(days));

            if (opts.daily) {
                if (opts.csv && opts.model.length > 0) {
                    printError(
                        "The daily endpoint does not support --model filtering; remove --model or use --history",
                    );
                    process.exit(1);
                }

                if (opts.csv) {
                    params.set("format", "csv");
                    const raw = await genText(
                        `/account/usage/daily?${params}`,
                        { apiKey: key },
                    );
                    process.stdout.write(raw);
                    return;
                }

                const qs = params.toString();
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily${qs ? `?${qs}` : ""}`,
                    { apiKey: key },
                );
                let rows = data.usage;
                if (opts.model.length > 0) {
                    const models = new Set(opts.model);
                    rows = rows.filter(
                        (r) => r.model != null && models.has(r.model),
                    );
                }
                printTable(
                    rows.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? "-",
                        model: r.model,
                        requests: r.requests,
                        cost: formatCost(r.cost_usd),
                        source: r.meter_source,
                    })),
                );
                return;
            }

            // History mode
            const limit = Number(opts.limit);
            if (!Number.isInteger(limit) || limit < 1) {
                printError("--limit must be a positive integer");
                process.exit(1);
            }
            params.set("limit", String(limit));
            if (opts.model.length > 0)
                params.set("models", opts.model.join(","));

            if (opts.csv) {
                params.set("format", "csv");
                const raw = await genText(`/account/usage?${params}`, {
                    apiKey: key,
                });
                process.stdout.write(raw);
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
                    cost: formatCost(r.cost_usd),
                    source: r.meter_source,
                    key: r.api_key ?? "-",
                    tokens_in: tokensIn(r),
                    tokens_out: tokensOut(r),
                })),
            );
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
