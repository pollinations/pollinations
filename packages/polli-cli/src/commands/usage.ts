import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
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
    input_tokens?: number;
    output_tokens?: number;
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
    name?: string;
    start?: string;
    createdAt?: string;
}

const asOptArray = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];

// commander collect option callback for repeatable flags.
function collect(v: string, previous?: string[]): string[] {
    return (previous && Array.isArray(previous) ? previous : []).concat(v);
}

// Resolve key name (or id) -> list of api_key_ids. Names resolve via /account/keys.
export const resolveKeyIds = async (
    keys: string[],
    key: string,
): Promise<{ ids: string[]; errors: string[] }> => {
    if (keys.length === 0) return { ids: [], errors: [] };
    // fetch key list once
    const list = await gen<{ data: KeyInfo[] }>("/account/keys", {
        apiKey: key,
    }).catch(() => null);
    const known = list?.data ?? [];
    const ids: string[] = [];
    const errors: string[] = [];
    for (const k of keys) {
        // id passed through directly (uuid-looking)
        // Hex/unanhän id: must contain a digit (a bare key *name* like
        // "aggressive-porcupine" must NOT be treated as an id).
        if (/^[A-Za-z0-9-]{16,}$/.test(k) && /[0-9]/.test(k)) {
            ids.push(k);
            continue;
        }
        const match = known.find(
            (e) =>
                e.id === k ||
                e.name === k ||
                e.start === k ||
                `${e.start}...` === k,
        );
        if (match) {
            ids.push(match.id);
        } else {
            const near = known
                .filter((e) => (e.name || "").toString().toLowerCase().includes(k.toLowerCase()))
                .slice(0, 3)
                .map((e) => `"${e.name}"`)
                .join(", ");
            errors.push(
                `unknown key "${k}"${near ? ` (did you mean ${near}?)` : ""}`,
            );
        }
    }
    return { ids, errors };
};

const fmtCost = (c: number | null | undefined): string =>
    c != null ? `$${Number(c).toFixed(4)}` : "-";

const fmtTokens = (t: number | null | undefined): string =>
    t != null ? String(t) : "-";

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option("-k, --key-id <name-or-id>", "Filter by API key (repeatable); name or id", collect)
    .option("--model <id>", "Filter by model id (repeatable)", collect)
    .option("--days <n>", "Number of days to include")
    .option("--csv", "Output raw CSV export")
    .action(async (opts) => {
        const key = requireKey();
        const keyNames = asOptArray(opts.keyId);
        const modelIds = asOptArray(opts.model);

        try {
            // default: balance
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

            const { ids: keyIds, errors } = await resolveKeyIds(
                keyNames,
                key,
            );
            if (errors.length > 0) {
                for (const e of errors) printError(e);
                process.exit(1);
            }

            const qs = new URLSearchParams();
            if (opts.limit != null && !opts.csv) {
                const l = Number(opts.limit);
                if (!Number.isInteger(l) || l < 1) {
                    printError("--limit must be a positive integer");
                    process.exit(1);
                }
                qs.set("limit", String(l));
            }
            if (keyIds.length) qs.set("api_key_ids", keyIds.join(","));
            if (modelIds.length) qs.set("models", modelIds.join(","));
            if (opts.days != null) qs.set("days", String(opts.days));
            if (opts.csv) qs.set("format", "csv");
            const queryStr = qs.toString();
            const q = queryStr ? `?${queryStr}` : "";

            if (opts.csv) {
                // CSV is raw text, not JSON — fetch it directly.
                const res = await fetch(
                    `${"https://gen.pollinations.ai"}${opts.daily ? "/account/usage/daily" : "/account/usage"}${q}`,
                    { headers: { Authorization: `Bearer ${requireKey()}` } },
                );
                if (!res.ok) {
                    printError(`CSV export failed: ${res.status} ${res.statusText}`);
                    process.exit(1);
                }
                const csv = await res.text();
                if (getOutputMode() === "json") {
                    printResult({ csv });
                } else {
                    process.stdout.write(csv);
                }
                return;
            }

            if (opts.daily) {
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily${q}`,
                    { apiKey: key },
                );
                printTable(
                    data.usage.map((r) => ({
                        date: r.date,
                        model: r.model,
                        requests: r.requests,
                        cost: fmtCost(r.cost_usd),
                        source: r.meter_source,
                    })),
                );
                return;
            }

            const data = await gen<UsageResponse>(
                `/account/usage${q}`,
                { apiKey: key },
            );
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    type: r.type,
                    model: r.model,
                    key: r.api_key ?? r.api_key_id ?? "-",
                    in: fmtTokens(r.input_tokens),
                    out: fmtTokens(r.output_tokens),
                    cost: fmtCost(r.cost_usd),
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
