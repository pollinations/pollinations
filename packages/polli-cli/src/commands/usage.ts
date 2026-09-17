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
}

interface UsageResponse {
    usage: UsageRecord[];
    count: number;
}

interface KeyInfo {
    id: string;
    name: string;
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

export const parseUsageDays = (value: string): number => {
    const days = Number(value);

    if (!Number.isInteger(days) || days < 1 || days > 90) {
        throw new Error("--days must be an integer between 1 and 90");
    }

    return days;
};


export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .option(
        "--for-key <name-or-id>",
        "Filter by API key name or ID (repeatable)",
        (value, previous: string[]) => [...previous, value],
        [],
    )
    .option(
        "--model <id>",
        "Filter by model (repeatable)",
        (value, previous: string[]) => [...previous, value],
        [],
    )
    .option("--days <n>", "Number of days (1-90)")
    .action(async (opts) => {

        const days =
            opts.days !== undefined ? parseUsageDays(opts.days) : undefined;

        const key = requireKey();

        try {
            let apiKeyIds: string[] | undefined;

            if (opts.forKey?.length) {
                const keys = await gen<{ data: KeyInfo[] }>("/account/keys", {
                    apiKey: key,
                });

                apiKeyIds = opts.forKey.map((value: string) => {
                    const match = keys.data.find(
                        (k) => k.id === value || k.name === value,
                    );

                    if (!match) {
                        printError(`Unknown API key: ${value}`);
                        process.exit(1);
                    }

                    return match.id;
                });
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

            if (opts.daily) {
                const params = new URLSearchParams();

                if (days !== undefined) {
                    params.set("days", String(days));
                }

                if (apiKeyIds?.length) {
                    params.set("api_key_ids", apiKeyIds.join(","));
                }

                const query = params.toString();

                const data = await gen<DailyUsageResponse>(
                    `/account/usage/daily${query ? `?${query}` : ""}`,
                    { apiKey: key },
                );

                printTable(
                    data.usage
                        .filter(
                            (r) =>
                                !opts.model?.length ||
                                opts.model.includes(r.model),
                        )
                        .map((r) => ({
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

            const params = new URLSearchParams({
                limit: String(limit),
            });

            if (days !== undefined) {
                params.set("days", String(days));
            }

            if (apiKeyIds?.length) {
                params.set("api_key_ids", apiKeyIds.join(","));
            }

            if (opts.model?.length) {
                params.set("models", opts.model.join(","));
            }

            const data = await gen<UsageResponse>(
                `/account/usage?${params.toString()}`,
                { apiKey: key },
            );

            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
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