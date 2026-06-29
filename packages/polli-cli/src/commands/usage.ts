import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";
import { t } from "../lib/i18n.js";
import { logActivity } from "../lib/logger.js";
import {
    UsageResponseSchema,
    DailyUsageResponseSchema,
    BalanceResponseSchema,
} from "../lib/validation.js";

export const usageCommand = new Command("usage")
    .description(
        "Show pollen balance (default), usage history, or daily summary",
    )
    .option("--limit <n>", "Number of records", "20")
    .option("--history", "Show individual request history")
    .option("--daily", "Show daily summary instead of individual requests")
    .addHelpText("after", `
Examples:
  polli usage
  polli usage --history --limit 50
  polli usage --daily
  polli usage --json
        `)
    .action(async (opts) => {
        const key = await requireKey();
        try {
            if (!opts.history && !opts.daily) {
                const data = await gen<unknown>("/account/balance", {
                    apiKey: key,
                });
                const validated = BalanceResponseSchema.safeParse(data);
                if (!validated.success) {
                    printError(`Invalid response: ${validated.error.message}`);
                    process.exit(1);
                }
                const balance = validated.data.balance;
                if (getOutputMode() !== "human") {
                    printResult({ pollen: balance });
                    return;
                }
                let color = chalk.green;
                if (balance <= 0) color = chalk.red;
                else if (balance < 1) color = chalk.yellow;
                printResult({ pollen: color(String(balance)) });
                logActivity("usage_balance", { balance });
                return;
            }

            if (opts.daily) {
                const data = await gen<unknown>("/account/usage/daily", {
                    apiKey: key,
                });
                const validated = DailyUsageResponseSchema.safeParse(data);
                if (!validated.success) {
                    printError(`Invalid response: ${validated.error.message}`);
                    process.exit(1);
                }
                printTable(
                    validated.data.usage.map((r) => ({
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
                logActivity("usage_daily", { count: validated.data.count });
                return;
            }

            const limit = Number(opts.limit);
            if (!Number.isInteger(limit) || limit < 1) {
                printError("--limit must be a positive integer");
                process.exit(1);
            }

            const data = await gen<unknown>(
                `/account/usage?limit=${limit}`,
                { apiKey: key },
            );
            const validated = UsageResponseSchema.safeParse(data);
            if (!validated.success) {
                printError(`Invalid response: ${validated.error.message}`);
                process.exit(1);
            }
            printTable(
                validated.data.usage.map((r) => ({
                    time: r.timestamp,
                    type: r.type,
                    model: r.model,
                    cost:
                        r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "-",
                    source: r.meter_source,
                })),
            );
            logActivity("usage_history", { limit });
        } catch (err) {
            printError(
                `Failed to fetch usage: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });