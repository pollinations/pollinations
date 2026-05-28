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
    pollen_spent: number;
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
    pollen_spent: number;
}

interface DailyUsageResponse {
    usage: DailyUsageRecord[];
    count: number;
}

const pollen = (row: { pollen_spent?: number }): string => {
    return row.pollen_spent != null
        ? `${row.pollen_spent.toFixed(4)} pollen`
        : "-";
};

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

            // In JSON mode, pass the raw API rows through (they carry numeric
            // `pollen_spent`). In human mode, collapse to a single `pollen`
            // column for display.
            const json = getOutputMode() === "json";

            if (opts.daily) {
                const data = await gen<DailyUsageResponse>(
                    "/account/usage/daily",
                    { apiKey: key },
                );
                if (json) {
                    printResult(data.usage);
                    return;
                }
                printTable(
                    data.usage.map((r) => ({
                        date: r.date,
                        model: r.model,
                        requests: r.requests,
                        pollen: pollen(r),
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
                `/account/usage?limit=${limit}`,
                { apiKey: key },
            );
            if (json) {
                printResult(data.usage);
                return;
            }
            printTable(
                data.usage.map((r) => ({
                    time: r.timestamp,
                    type: r.type,
                    model: r.model,
                    pollen: pollen(r),
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
