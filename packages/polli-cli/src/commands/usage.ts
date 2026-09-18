import chalk from "chalk";
import { Command } from "commander";
import { gen, genText, requireKey } from "../lib/api.js";
import { setKeyOverride } from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
    printWarn,
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
    model: string | null;
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

/** Minimal shape of a key as returned by `/account/keys`. */
export interface UsageKeyInfo {
    id: string;
    name: string | null;
}

/** The usage API accepts a rolling window of at most 90 days. */
export const MAX_USAGE_DAYS = 90;

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

/**
 * Resolve `--key` filter values (names or ids) to key ids. Ids pass through;
 * names resolve against the account's key list. An unknown value fails with
 * near matches so a typo reads as an error, not a silent empty table.
 */
export function resolveKeyIds(
    keys: UsageKeyInfo[],
    requested: string[],
): string[] {
    const names = keys.map((k) => k.name).filter((n): n is string => n != null);
    return requested.map((want) => {
        const match = keys.find((k) => k.id === want || k.name === want);
        if (match) return match.id;
        const needle = want.toLowerCase();
        const near = names.filter((n) => n.toLowerCase().includes(needle));
        const list = near.length > 0 ? near : names;
        const label = near.length > 0 ? "Near matches" : "Available keys";
        throw new Error(
            `Unknown key "${want}". ${label}: ${list.join(", ") || "(none)"}`,
        );
    });
}

export function tokensIn(r: UsageRecord): number {
    return (
        r.input_text_tokens +
        r.input_cached_tokens +
        r.input_audio_tokens +
        r.input_image_tokens
    );
}

export function tokensOut(r: UsageRecord): number {
    return (
        r.output_text_tokens +
        r.output_reasoning_tokens +
        r.output_audio_tokens +
        r.output_image_tokens
    );
}

/** `/account/usage/daily` has no `models` param, so daily model filtering runs client-side. */
export function filterByModel<T extends { model: string | null }>(
    rows: T[],
    models: string[],
): T[] {
    return models.length === 0
        ? rows
        : rows.filter((r) => r.model != null && models.includes(r.model));
}

export interface SplitKeyFlag {
    /** `--key` before "usage": the existing global auth override. */
    authKey: string | undefined;
    /** `--key` after "usage": this command's repeatable key filter. */
    filterKeys: string[];
}

/**
 * `--key` is already the global auth-override flag on every `polli` command,
 * and Commander resolves a same-named option to that global one even when it
 * appears after the subcommand — a local `--key` on `usage` would never see
 * its value. Split argv by hand instead: README/SKILL.md only ever document
 * `--key` *before* the subcommand for auth, so that position keeps its
 * meaning; `--key` *after* "usage" is free to become this quest's filter.
 */
export function splitKeyFlag(
    argv: string[],
    subcommand = "usage",
): SplitKeyFlag {
    const idx = argv.indexOf(subcommand);
    const before = idx < 0 ? argv : argv.slice(0, idx);
    const after = idx < 0 ? [] : argv.slice(idx + 1);
    const values = (args: string[]): string[] => {
        const out: string[] = [];
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === "--key") {
                if (i + 1 < args.length) out.push(args[++i]);
            } else if (arg.startsWith("--key=")) {
                out.push(arg.slice("--key=".length));
            }
        }
        return out;
    };
    return { authKey: values(before).at(-1), filterKeys: values(after) };
}

const collect = (value: string, previous: string[]) => previous.concat(value);

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option("--days <n>", `Rolling window in days, max ${MAX_USAGE_DAYS}`)
    .option(
        "--model <id>",
        "Filter by model id (repeatable)",
        collect,
        [] as string[],
    )
    .option("--csv", "Print the raw CSV export instead of a table")
    .addHelpText(
        "after",
        chalk.dim(
            '\nKey filter:\n  --key <name-or-id>  Placed after "usage": filter by API key name or id\n                      (repeatable, resolved via /account/keys). Placed before\n                      "usage" it stays the global auth override.',
        ),
    )
    .action(async (opts) => {
        const { authKey, filterKeys } = splitKeyFlag(process.argv);
        setKeyOverride(authKey);
        const key = requireKey();

        if (!opts.history && !opts.daily) {
            try {
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
            } catch (err) {
                printError(
                    `Failed to fetch balance: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
            return;
        }

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

        let keyIds: string[] = [];
        if (filterKeys.length > 0) {
            try {
                const res = await gen<{ data: UsageKeyInfo[] }>(
                    "/account/keys",
                    { apiKey: key },
                );
                keyIds = resolveKeyIds(res.data ?? [], filterKeys);
            } catch (err) {
                printError(
                    err instanceof Error
                        ? err.message
                        : "Failed to resolve --key filters",
                );
                process.exit(1);
            }
        }

        const models: string[] = opts.model;
        const params = new URLSearchParams();
        if (days !== undefined) params.set("days", String(days));
        if (keyIds.length > 0) params.set("api_key_ids", keyIds.join(","));

        try {
            if (opts.daily) {
                if (models.length > 0 && opts.csv) {
                    printWarn(
                        "--model isn't supported by the daily CSV export; showing the unfiltered export.",
                    );
                }
                if (opts.csv) {
                    params.set("format", "csv");
                    process.stdout.write(
                        await genText(`/account/usage/daily?${params}`, {
                            apiKey: key,
                        }),
                    );
                    return;
                }
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily?${params}`,
                    { apiKey: key },
                );
                const rows = filterByModel(data.usage, models);
                printTable(
                    rows.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? "-",
                        model: r.model ?? "-",
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
            params.set("limit", String(limit));
            if (models.length > 0) params.set("models", models.join(","));

            if (opts.csv) {
                params.set("format", "csv");
                process.stdout.write(
                    await genText(`/account/usage?${params}`, { apiKey: key }),
                );
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
