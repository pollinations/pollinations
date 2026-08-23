import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";

type EarningsSource = "byop_markup" | "community_model";

export type DeveloperEarningsRow = {
    date: string;
    entity_id: string;
    entity_name: string;
    source: EarningsSource;
    requests: number;
    paid_requests: number;
    tier_requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
};

interface DeveloperEarningsResponse {
    daily: DeveloperEarningsRow[];
    perEntity: DeveloperEarningsRow[];
}

export const earningsCommand = new Command("earnings")
    .description("Show developer pollen earnings and per-app/model breakdown")
    .option(
        "--days <n>",
        "Number of days to summarize (1-90, defaults to 30)",
        "30",
    )
    .action(async (opts) => {
        const key = requireKey();

        try {
            const days = Number(opts.days);
            if (!Number.isInteger(days) || days < 1) {
                printError("--days must be a positive integer");
                process.exit(1);
            }

            const data = await gen<DeveloperEarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );

            if (getOutputMode() !== "human") {
                printResult({
                    daily: data.daily,
                    perEntity: data.perEntity,
                });
                return;
            }

            const totalEarned = data.perEntity.reduce(
                (sum, row) => sum + row.pollen_earned,
                0,
            );

            console.log(
                chalk.bold(`\nTotal Earnings: ${totalEarned.toLocaleString()} pollen\n`),
            );

            if (data.perEntity.length > 0) {
                printTable(
                    data.perEntity
                        .sort((a, b) => b.pollen_earned - a.pollen_earned)
                        .map((r) => ({
                            name: r.entity_name || r.entity_id,
                            type: r.source === "byop_markup" ? "app" : "model",
                            requests: r.requests,
                            earned: r.pollen_earned,
                        })),
                );
            } else {
                console.log(
                    chalk.dim("No earnings data found for this period."),
                );
            }
        } catch (err) {
            printError(
                `Failed to fetch earnings: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
