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

export interface UsageRecord {
    timestamp: string;
    type: string;
    model: string | null;
    api_key_id?: string | null;
    api_key?: string | null;
    input_text_tokens?: number;
    input_cached_tokens?: number;
    input_audio_tokens?: number;
    input_image_tokens?: number;
    output_text_tokens?: number;
    output_reasoning_tokens?: number;
    output_audio_tokens?: number;
    output_image_tokens?: number;
    cost_usd: number;
    meter_source: string | null;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

export interface DailyUsageRecord {
    date: string;
    model: string | null;
    api_key_id?: string | null;
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

export interface KeyRef {
    id: string;
    name: string;
}

/** Repeatable option collector: `--key a --key b` and `--key a,b` both work. */
export const collectList = (value: string, previous: string[] = []) =>
    previous.concat(
        value
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v.length > 0),
    );

/** Tokens in and out for one usage record, across all modalities. */
export const tokenCounts = (r: UsageRecord) => ({
    in:
        (r.input_text_tokens ?? 0) +
        (r.input_cached_tokens ?? 0) +
        (r.input_audio_tokens ?? 0) +
        (r.input_image_tokens ?? 0),
    out:
        (r.output_text_tokens ?? 0) +
        (r.output_reasoning_tokens ?? 0) +
        (r.output_audio_tokens ?? 0) +
        (r.output_image_tokens ?? 0),
});

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const looksLikeKeyId = (value: string) => UUID_RE.test(value);

const levenshtein = (a: string, b: string): number => {
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(
                prev[j] + 1,
                prev[j - 1] + 1,
                diag + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            diag = tmp;
        }
    }
    return prev[b.length];
};

/** Names close to `value`, for an error message instead of a silent empty table. */
export const suggestKeys = (value: string, keys: KeyRef[]): string[] => {
    const needle = value.toLowerCase();
    return keys
        .map((k) => k.name)
        .filter((name) => {
            const n = name.toLowerCase();
            if (n.includes(needle) || needle.includes(n)) return true;
            return levenshtein(n, needle) <= 3;
        })
        .slice(0, 5);
};

/** Resolve `--key` arguments (names or ids) into key ids. Ids pass through. */
export const resolveKeyArgs = (
    args: string[],
    keys: KeyRef[],
): { ids: string[]; unknown: string[] } => {
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const arg of args) {
        const byName = keys.find(
            (k) => k.name.toLowerCase() === arg.toLowerCase(),
        );
        if (byName) {
            ids.push(byName.id);
            continue;
        }
        const byId = keys.find((k) => k.id === arg);
        if (byId) {
            ids.push(byId.id);
            continue;
        }
        if (looksLikeKeyId(arg)) {
            ids.push(arg);
            continue;
        }
        unknown.push(arg);
    }
    return { ids: [...new Set(ids)], unknown };
};

export const fetchAccountKeys = async (apiKey: string): Promise<KeyRef[]> => {
    const res = await gen<{ data: KeyRef[] }>("/account/keys", { apiKey });
    return res.data ?? [];
};

export interface UsageFilter {
    view: "history" | "daily";
    limit?: number;
    days?: number;
    keyIds?: string[];
    models?: string[];
    csv?: boolean;
}

/** Build the `/account/usage*` path with every filter the API accepts. */
export const buildUsageQuery = ({
    view,
    limit,
    days,
    keyIds = [],
    models = [],
    csv = false,
}: UsageFilter): string => {
    const params = new URLSearchParams();
    if (view === "history") {
        params.set("limit", String(limit ?? 20));
    }
    if (days !== undefined) params.set("days", String(days));
    // The daily endpoint has no `models` param and 500s on `api_key_ids`, so
    // both filters are applied client-side for that view (see filterDailyRows).
    if (view === "history" && keyIds.length > 0) {
        params.set("api_key_ids", keyIds.join(","));
    }
    if (view === "history" && models.length > 0) {
        params.set("models", models.join(","));
    }
    if (csv) params.set("format", "csv");
    const base = view === "daily" ? "/account/usage/daily" : "/account/usage";
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
};

/**
 * Daily rows are filtered client-side: the daily endpoint has no `models`
 * param, and passing `api_key_ids` makes it fail with a 500
 * (`/account/usage/daily?days=7&api_key_ids=...` -> "Failed to fetch usage
 * data"), so both filters are applied here instead.
 */
export const filterDailyRows = (
    rows: DailyUsageRecord[],
    keyIds: string[] = [],
    models: string[] = [],
): DailyUsageRecord[] => {
    const wantedKeys = new Set(keyIds);
    const wantedModels = new Set(models);
    return rows.filter(
        (r) =>
            (wantedKeys.size === 0 ||
                (r.api_key_id != null && wantedKeys.has(r.api_key_id))) &&
            (wantedModels.size === 0 ||
                (r.model != null && wantedModels.has(r.model))),
    );
};

const looksLikeSecret = (value: string) =>
    value.startsWith("sk_") || value.startsWith("pk_");

export interface KeyArgs {
    /** `--key` that selects the API key used to authenticate this command. */
    authKey: string | undefined;
    /** `--key <name-or-id>` values that filter the usage rows returned. */
    filterKeys: string[];
}

/**
 * Split `--key` arguments by position. commander hands the global `--key`
 * (the stored-key override) any value written after the subcommand name, so a
 * local option of the same name never receives it. Read argv instead:
 *
 *   polli --key sk_... usage --history       auth override (documented global)
 *   polli usage --history --key polli-harness-dsh   filter by key name or id
 *   polli usage --history --key sk_...       auth override, as in the README
 */
export const splitKeyArgs = (argv: string[], command = "usage"): KeyArgs => {
    const at = argv.indexOf(command);
    const before = at < 0 ? [] : argv.slice(0, at);
    const after = at < 0 ? [] : argv.slice(at + 1);

    const values = (args: string[]): string[] => {
        const out: string[] = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === "--key" && i + 1 < args.length) {
                out.push(args[++i]);
            } else if (args[i].startsWith("--key=")) {
                out.push(args[i].slice("--key=".length));
            }
        }
        return out.flatMap((v) =>
            v
                .split(",")
                .map((part) => part.trim())
                .filter((part) => part.length > 0),
        );
    };

    let authKey: string | undefined;
    for (const value of values(before)) {
        authKey = value;
    }

    const filterKeys: string[] = [];
    for (const value of values(after)) {
        if (looksLikeSecret(value)) {
            authKey = value;
        } else {
            filterKeys.push(value);
        }
    }

    return { authKey, filterKeys };
};

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    // Declared for discoverability only: commander routes a `--key` written
    // after the subcommand name into the global option, so this never holds a
    // value. `splitKeyArgs` reads argv for the real filter list.
    .option(
        "--key <name-or-id>",
        "Only usage for this key, by name or id (repeatable, comma-separated)",
        collectList,
        [] as string[],
    )
    .option(
        "--model <id>",
        "Only usage for this model id (repeatable, comma-separated)",
        collectList,
        [] as string[],
    )
    .option("--days <n>", "Look back n days instead of the server default")
    .option("--csv", "Print the raw CSV export instead of a table")
    .addHelpText(
        "after",
        `
Key filter:
  --key <name-or-id>   after "usage": filter by API key name or id
                       before "usage": the global stored-key override

Examples:
  polli usage --history --key polli-harness-dsh --days 1
  polli usage --daily --model openai --days 7
  polli usage --history --limit 50 --csv > usage.csv
`,
    )
    .action(async (opts) => {
        // commander moves a post-subcommand `--key` into the global auth option
        // and its preAction hook has already applied it, so recompute: a key
        // filter must not replace the credential used to read the account.
        const { authKey, filterKeys } = splitKeyArgs(process.argv);
        setKeyOverride(authKey);
        const key = requireKey();
        const keyArgs: string[] =
            filterKeys.length > 0 ? filterKeys : (opts.key ?? []);
        const modelArgs: string[] = opts.model ?? [];
        const days = opts.days === undefined ? undefined : Number(opts.days);

        try {
            if (days !== undefined && (!Number.isInteger(days) || days < 1)) {
                printError("--days must be a positive integer");
                process.exit(1);
            }

            const filtered = keyArgs.length > 0 || modelArgs.length > 0;
            if (filtered && !opts.history && !opts.daily) {
                printError("--key and --model require --history or --daily");
                process.exit(1);
            }

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

            let keyIds: string[] = [];
            if (keyArgs.length > 0) {
                const keys = await fetchAccountKeys(key);
                const resolved = resolveKeyArgs(keyArgs, keys);
                if (resolved.unknown.length > 0) {
                    for (const unknown of resolved.unknown) {
                        const near = suggestKeys(unknown, keys);
                        printError(
                            `Unknown key "${unknown}".${
                                near.length > 0
                                    ? ` Near matches: ${near.join(", ")}`
                                    : ""
                            }`,
                        );
                    }
                    process.exit(1);
                }
                keyIds = resolved.ids;
            }

            const view = opts.daily ? "daily" : "history";

            if (opts.csv) {
                // Raw exports cannot be filtered locally, so pass the key
                // filter through even for `--daily` (which 500s today; see
                // filterDailyRows).
                const path = buildUsageQuery({
                    view,
                    limit: Number(opts.limit),
                    days,
                    keyIds,
                    models: modelArgs,
                    csv: true,
                });
                process.stdout.write(await genText(path, { apiKey: key }));
                return;
            }

            if (opts.daily) {
                const data = await gen<DailyUsageResponse>(
                    buildUsageQuery({ view, days }),
                    { apiKey: key },
                );
                const rows = filterDailyRows(data.usage, keyIds, modelArgs);
                printTable(
                    rows.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? r.api_key_id ?? "-",
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
            const data = await gen<UsageResponse>(
                buildUsageQuery({
                    view,
                    limit,
                    days,
                    keyIds,
                    models: modelArgs,
                }),
                { apiKey: key },
            );
            printTable(
                data.usage.map((r) => {
                    const { in: tokensIn, out: tokensOut } = tokenCounts(r);
                    return {
                        time: r.timestamp,
                        type: r.type,
                        key: r.api_key ?? r.api_key_id ?? "-",
                        model: r.model ?? "-",
                        in: tokensIn,
                        out: tokensOut,
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
