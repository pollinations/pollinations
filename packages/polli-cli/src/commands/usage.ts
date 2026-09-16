import chalk from "chalk";
import { Command } from "commander";
import { gen, genText, requireKey } from "../lib/api.js";
import { setKeyOverride } from "../lib/config.js";
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
    api_key_id: string | null;
    input_text_tokens?: number | null;
    input_cached_tokens?: number | null;
    input_audio_tokens?: number | null;
    input_image_tokens?: number | null;
    output_text_tokens?: number | null;
    output_reasoning_tokens?: number | null;
    output_audio_tokens?: number | null;
    output_image_tokens?: number | null;
    cost_usd: number;
    meter_source: string;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    model: string;
    api_key: string | null;
    api_key_id: string | null;
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

/** Minimal shape of a key as returned by /account/keys. */
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
 * Resolve --key values (names or ids) to key ids. Names resolve against the
 * account's key list; ids pass through. Unknown values fail with near matches
 * so a typo never reads as a silent empty table.
 */
export function resolveKeyIds(
    keys: UsageKeyInfo[],
    requested: string[],
): string[] {
    return requested.map((want) => {
        const byId = keys.find((k) => k.id === want);
        if (byId) return byId.id;
        const byName = keys.find((k) => k.name === want);
        if (byName) return byName.id;
        const needle = want.toLowerCase();
        const near = keys
            .filter((k) => k.name?.toLowerCase().includes(needle))
            .map((k) => k.name);
        const list =
            near.length > 0
                ? near
                : keys.map((k) => k.name).filter((n) => n != null);
        const label = near.length > 0 ? "Near matches" : "Available keys";
        throw new Error(
            `Unknown key "${want}". ${label}: ${list.join(", ") || "(none)"}`,
        );
    });
}

export function tokensIn(r: UsageRecord): number {
    return (
        (r.input_text_tokens ?? 0) +
        (r.input_cached_tokens ?? 0) +
        (r.input_audio_tokens ?? 0) +
        (r.input_image_tokens ?? 0)
    );
}

export function tokensOut(r: UsageRecord): number {
    return (
        (r.output_text_tokens ?? 0) +
        (r.output_reasoning_tokens ?? 0) +
        (r.output_audio_tokens ?? 0) +
        (r.output_image_tokens ?? 0)
    );
}

const collect = (value: string, previous: string[]) => previous.concat(value);

const looksLikeSecret = (value: string) =>
    value.startsWith("sk_") || value.startsWith("pk_");

export interface UsageKeyArgs {
    /** `--key` before the subcommand: the global auth override. */
    authKey: string | undefined;
    /** `--key` after the subcommand: usage key filters (names or ids). */
    filterKeys: string[];
}

/**
 * Commander recognises the global `--key` (auth override) even after the
 * subcommand name, so a local same-named option on `usage` would never
 * receive its value. Split argv by hand instead: `--key` before "usage"
 * stays the auth override, `--key` after it is a repeatable key filter.
 * A post-subcommand value that looks like a secret key (`sk_`/`pk_`) keeps
 * the historical meaning of `polli usage --key <secret>`: auth, not filter.
 */
export function splitKeyArgs(argv: string[], command = "usage"): UsageKeyArgs {
    const idx = argv.indexOf(command);
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
    const authParts = values(before);
    let authKey = authParts.at(-1);
    const filterKeys: string[] = [];
    for (const value of values(after)) {
        if (authKey === undefined && looksLikeSecret(value)) {
            authKey = value;
        } else {
            filterKeys.push(value);
        }
    }
    return { authKey, filterKeys };
}

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option(
        "--model <id>",
        "Filter by model id (repeatable)",
        collect,
        [] as string[],
    )
    .option("--days <n>", "Rolling window in days, max 90")
    .option("--csv", "Print the raw CSV export")
    .addHelpText(
        "after",
        chalk.dim(
            '\nKey filter:\n  --key <name-or-id>   Filter by API key name or id (repeatable, resolves\n                       names via /account/keys). Placed after "usage" it filters;\n                       before "usage" it stays the global auth override.',
        ),
    )
    .action(async (opts) => {
        // Fix up the auth override before requireKey(): commander routes a
        // post-subcommand `--key` into the global option (and the preAction
        // hook), so restore the intended auth key here.
        const { authKey, filterKeys } = splitKeyArgs(process.argv);
        setKeyOverride(authKey);
        const key = requireKey();

        // Default: show balance (unless --history or --daily)
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
                return;
            } catch (err) {
                printError(
                    `Failed to fetch balance: ${err instanceof Error ? err.message : "unknown"}`,
                );
                process.exit(1);
            }
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

        const models: string[] = opts.model;

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
                        : "Failed to resolve keys",
                );
                process.exit(1);
            }
        }

        const params = new URLSearchParams();
        if (days !== undefined) params.set("days", String(days));
        if (keyIds.length > 0) params.set("api_key_ids", keyIds.join(","));

        try {
            if (opts.daily) {
                // The daily schema has no `models` param, so --model is
                // applied client-side for this view.
                if (opts.csv) params.set("format", "csv");
                const path = `/account/usage/daily?${params}`;
                if (opts.csv) {
                    process.stdout.write(await genText(path, { apiKey: key }));
                    return;
                }
                const data = await gen<DailyUsageResponse>(path, {
                    apiKey: key,
                });
                const rows =
                    models.length > 0
                        ? data.usage.filter((r) => models.includes(r.model))
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
            params.set("limit", String(limit));
            if (models.length > 0) params.set("models", models.join(","));
            if (opts.csv) params.set("format", "csv");
            const path = `/account/usage?${params}`;
            if (opts.csv) {
                process.stdout.write(await genText(path, { apiKey: key }));
                return;
            }
            const data = await gen<UsageResponse>(path, { apiKey: key });
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
