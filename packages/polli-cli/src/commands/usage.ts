import chalk from "chalk";
import { Command } from "commander";
import { ApiError, gen, requireKey } from "../lib/api.js";
import { BASE_URL, resolveApiKey } from "../lib/config.js";
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
    api_key: string | null;
    api_key_id: string | null;
    input_text_tokens: number;
    input_cached_tokens: number;
    input_audio_tokens: number;
    input_audio_seconds: number;
    input_image_tokens: number;
    output_text_tokens: number;
    output_reasoning_tokens: number;
    output_audio_tokens: number;
    output_audio_seconds: number;
    output_image_tokens: number;
    output_video_seconds: number;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
    api_key: string | null;
    api_key_id: string | null;
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

const MAX_DAYS = 90;

function parseDays(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
        printError(`--days must be an integer between 1 and ${MAX_DAYS}`);
        process.exit(1);
    }
    return String(n);
}

function collect(value: string, previous: string[]): string[] {
    return previous ? [...previous, value] : [value];
}

function totalInputTokens(r: UsageRecord): number {
    return (
        (r.input_text_tokens ?? 0) +
        (r.input_cached_tokens ?? 0) +
        (r.input_image_tokens ?? 0) +
        (r.input_audio_tokens ?? 0)
    );
}

function totalOutputTokens(r: UsageRecord): number {
    return (
        (r.output_text_tokens ?? 0) +
        (r.output_reasoning_tokens ?? 0) +
        (r.output_image_tokens ?? 0) +
        (r.output_audio_tokens ?? 0)
    );
}

function nearMatches(name: string, candidates: string[]): string[] {
    const lower = name.toLowerCase();
    // substring + edit distance <=2 simple heuristic
    const scored = candidates
        .map((c) => {
            const cl = c.toLowerCase();
            if (cl === lower) return { c, score: 0 };
            if (cl.includes(lower) || lower.includes(cl))
                return { c, score: 1 };
            // simple levenshtein for short strings
            const dist = levenshtein(lower, cl);
            return { c, score: dist };
        })
        .filter(({ score }) => score <= 2)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map(({ c }) => c);
    if (scored.length > 0) return scored;
    // fallback: prefix matches
    return candidates
        .filter((c) => c.toLowerCase().startsWith(lower.slice(0, 2)))
        .slice(0, 5);
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
        Array(n + 1).fill(0),
    );
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }
    return dp[m][n];
}

async function resolveKeyIds(
    apiKey: string,
    inputs: string[],
): Promise<string[]> {
    if (!inputs || inputs.length === 0) return [];
    // fetch key list to resolve names to ids
    let keys: KeyInfo[] = [];
    try {
        const res = await gen<{ data: KeyInfo[] }>("/account/keys", { apiKey });
        keys = res.data ?? [];
    } catch {
        // if we cannot list keys, treat inputs as ids passthrough
        return inputs;
    }
    const byName = new Map(keys.map((k) => [k.name, k.id]));
    const byId = new Set(keys.map((k) => k.id));
    const candidateNames = keys.map((k) => k.name);
    const resolved: string[] = [];
    for (const input of inputs) {
        if (byId.has(input)) {
            resolved.push(input);
            continue;
        }
        if (byName.has(input)) {
            const id = byName.get(input);
            if (id) resolved.push(id);
            continue;
        }
        const matches = nearMatches(input, candidateNames);
        const hint =
            matches.length > 0 ? ` Did you mean: ${matches.join(", ")}?` : "";
        const listHint =
            candidateNames.length > 0
                ? ` Available keys: ${candidateNames.slice(0, 10).join(", ")}`
                : "";
        printError(`Unknown key "${input}".${hint}${listHint}`);
        process.exit(1);
    }
    return resolved;
}

async function fetchCsv(path: string, apiKey: string): Promise<string> {
    const key = resolveApiKey(apiKey) ?? apiKey;
    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new ApiError(
            res.status,
            `${res.status} ${res.statusText}: ${text}`,
        );
    }
    return res.text();
}

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option(
        "--key <name-or-id>",
        "Filter by API key name or id (repeatable)",
        collect,
        [],
    )
    .option("--model <id>", "Filter by model id (repeatable)", collect, [])
    .option("--days <n>", "Rolling window in days (1-90)")
    .option("--csv", "Export as CSV (passes format=csv)")
    .action(async (opts) => {
        const key = requireKey();

        try {
            // Default: show balance (unless --history or --daily)
            if (!opts.history && !opts.daily) {
                if (
                    opts.key?.length ||
                    opts.model?.length ||
                    opts.days ||
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

            const days = parseDays(opts.days);
            const keyIds = await resolveKeyIds(key, opts.key ?? []);
            const models: string[] = opts.model ?? [];
            const isCsv = Boolean(opts.csv);
            const isJson = getOutputMode() === "json";

            const buildQuery = (extra: Record<string, string | undefined>) => {
                const params = new URLSearchParams();
                for (const [k, v] of Object.entries(extra)) {
                    if (v !== undefined && v !== "") params.set(k, v);
                }
                if (days) params.set("days", days);
                if (keyIds.length > 0)
                    params.set("api_key_ids", keyIds.join(","));
                if (models.length > 0) params.set("models", models.join(","));
                if (isCsv) params.set("format", "csv");
                const qs = params.toString();
                return qs ? `?${qs}` : "";
            };

            if (opts.daily) {
                const query = buildQuery({});
                // Note: /account/usage/daily currently does not filter by models; pass through for history only if needed
                // We still send models param if provided — backend may ignore it.
                if (isCsv) {
                    const csv = await fetchCsv(
                        `/account/usage/daily${query}`,
                        key,
                    );
                    process.stdout.write(csv.endsWith("\n") ? csv : `${csv}\n`);
                    return;
                }
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily${query}`,
                    {
                        apiKey: key,
                    },
                );
                if (isJson) {
                    printResult(data as unknown as Record<string, unknown>);
                    return;
                }
                printTable(
                    data.usage.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? r.api_key_id ?? "-",
                        model: r.model ?? "-",
                        requests: r.requests,
                        cost:
                            r.cost_usd != null
                                ? `$${r.cost_usd.toFixed(4)}`
                                : "-",
                        source: r.meter_source ?? "-",
                    })),
                );
                return;
            }

            // --history path
            const limit = Number(opts.limit);
            if (!Number.isInteger(limit) || limit < 1) {
                printError("--limit must be a positive integer");
                process.exit(1);
            }
            const query = buildQuery({ limit: String(limit) });
            if (isCsv) {
                const csv = await fetchCsv(`/account/usage${query}`, key);
                process.stdout.write(csv.endsWith("\n") ? csv : `${csv}\n`);
                return;
            }
            const data = await gen<UsageResponse>(`/account/usage${query}`, {
                apiKey: key,
            });
            if (isJson) {
                printResult(data as unknown as Record<string, unknown>);
                return;
            }
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    key: r.api_key ?? r.api_key_id ?? "-",
                    type: r.type,
                    model: r.model ?? "-",
                    tokens_in: totalInputTokens(r),
                    tokens_out: totalOutputTokens(r),
                    cost:
                        r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "-",
                    source: r.meter_source ?? "-",
                })),
            );
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
