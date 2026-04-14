import chalk from "chalk";
import { Command } from "commander";
import { enter, requireKey } from "../lib/api.js";
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

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .action(async (opts) => {
        const key = requireKey();

        try {
            // Default: show balance (unless --history or --daily)
            if (!opts.history && !opts.daily) {
                const data = await enter<BalanceResponse>(
                    "/api/account/balance",
                    { apiKey: key },
                );
                if (getOutputMode() === "human") {
                    const bal = data.balance;
                    const color =
                        bal <= 0
                            ? chalk.red
                            : bal < 1
                              ? chalk.yellow
                              : chalk.green;
                    printResult({ pollen: color(String(bal)) });
                } else {
                    printResult({ pollen: data.balance });
                }
                return;
            }

            if (opts.daily) {
                const data = await enter<DailyUsageResponse>(
                    "/api/account/usage/daily",
                    { apiKey: key },
                );
                printTable(
                    data.usage.map((r) => ({
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
            } else if (opts.history) {
                const limit = Number.parseInt(opts.limit, 10);
                if (Number.isNaN(limit) || limit < 1) {
                    printError("--limit must be a positive integer");
                    process.exit(1);
                }
                const data = await enter<UsageResponse>(
                    `/api/account/usage?limit=${limit}`,
                    { apiKey: key },
                );
                printTable(
                    data.usage.map((r) => ({
                        time: r.timestamp,
                        type: r.type,
                        model: r.model,
                        cost:
                            r.cost_usd != null
                                ? `$${r.cost_usd.toFixed(4)}`
                                : "-",
                        source: r.meter_source,
                    })),
                );
            }
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
