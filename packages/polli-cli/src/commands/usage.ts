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
    api_key?: string;
    api_key_id?: string;
    timestamp: string;
    type: string;
    model: string;
    cost_usd: number;
    meter_source: string;
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface DailyUsageRecord {
    api_key?: string;
    api_key_id?: string;
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

const collect = (value: string, previous: string[]) => [
    ...previous,
    value,
];

const resolveKeyIds = async (requested: string[], apiKey: string) => {
    if (!requested.length) return [];
    const keys = await gen<{ data: KeyInfo[] }>("/account/keys", { apiKey });
    const ids: string[] = [];
    for (const value of requested) {
        const match = keys.data?.find(
            (candidate) => candidate.id === value || candidate.name === value,
        );
        if (!match) {
            const near = (keys.data ?? [])
                .filter((candidate) =>
                    candidate.name.toLowerCase().includes(value.toLowerCase()),
                )
                .map((candidate) => candidate.name)
                .slice(0, 5);
            throw new Error(
                `Unknown key "${value}"${near.length ? `. Near matches: ${near.join(", ")}` : ""}`,
            );
        }
        ids.push(match.id);
    }
    return ids;
};

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option(
        "--key <name-or-id>",
        "Filter by key name or id (repeatable)",
        collect,
        [],
    )
    .option(
        "--model <id>",
        "Filter by model id (repeatable)",
        collect,
        [],
    )
    .option("--days <n>", "Number of days to include")
    .option("--csv", "Request CSV output from the server")
    .action(async (opts) => {
        const key = requireKey();

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

            if (opts.daily) {
                const query = new URLSearchParams();
                const ids = await resolveKeyIds(opts.key as string[], key);
                if (ids.length) {
                    query.set("api_key_ids", ids.join(","));
                }
                if (opts.model.length) query.set("models", opts.model.join(","));
                if (opts.days !== undefined) query.set("days", String(opts.days));
                if (opts.csv) query.set("format", "csv");
                if (opts.csv) {
                    const csv = await gen<string>(
                        `/account/usage/daily?${query}`,
                        { apiKey: key, responseType: "text" },
                    );
                    process.stdout.write(`${csv.trimEnd()}\n`);
                    return;
                }
                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily${query.toString() ? `?${query}` : ""}`,
                    { apiKey: key },
                );
                printTable(
                    data.usage.map((r) => ({
                        date: r.date,
                        key: r.api_key ?? r.api_key_id ?? "-",
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
            const keyIds = await resolveKeyIds(opts.key as string[], key);
            if (opts.csv) {
                const csv = await gen<string>(
                    (() => {
                        const query = new URLSearchParams({ limit: String(limit), format: "csv" });
                        if (keyIds.length) query.set("api_key_ids", keyIds.join(","));
                        if (opts.model.length) query.set("models", opts.model.join(","));
                        if (opts.days !== undefined) query.set("days", String(opts.days));
                        return `/account/usage?${query}`;
                    })(),
                    { apiKey: key, responseType: "text" },
                );
                process.stdout.write(`${csv.trimEnd()}\n`);
                return;
            }
            const data = await gen<UsageResponse>(
                (() => {
                    const query = new URLSearchParams({ limit: String(limit) });
                    if (keyIds.length) query.set("api_key_ids", keyIds.join(","));
                    if (opts.model.length) query.set("models", opts.model.join(","));
                    if (opts.days !== undefined) query.set("days", String(opts.days));
                    return `/account/usage?${query}`;
                })(),
                { apiKey: key },
            );
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    key: r.api_key ?? r.api_key_id ?? "-",
                    type: r.type,
                    model: r.model,
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
