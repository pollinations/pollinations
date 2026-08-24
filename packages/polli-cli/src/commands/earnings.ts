import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";

export interface DeveloperEarningsRow {
    date: string;
    entity_id: string;
    entity_name: string;
    source: string;
    requests: number;
    paid_requests: number;
    tier_requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
}

export interface DeveloperEarningsResponse {
    daily: DeveloperEarningsRow[];
    perEntity: DeveloperEarningsRow[];
}

export const earningsCommand = new Command("earnings")
    .description("Show developer earnings summary and breakdown")
    .option("--days <n>", "Number of days to include", "30")
    .action(async (opts) => {
        const key = requireKey();

        const days = Number(opts.days);
        if (!Number.isInteger(days) || days < 1) {
            printError("--days must be a positive integer");
            process.exit(1);
        }

        try {
            const data = await gen<DeveloperEarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );

            if (getOutputMode() !== "human") {
                printResult(data);
                return;
            }

            const totalEarned = data.perEntity.reduce(
                (sum, row) => sum + (row.pollen_earned || 0),
                0,
            );
            const totalRequests = data.perEntity.reduce(
                (sum, row) => sum + (row.requests || 0),
                0,
            );

            console.log(
                chalk.bold(
                    `Total Pollen Earned: ${chalk.green(totalEarned.toFixed(2))} across ${totalRequests} requests (${days} days)\n`,
                ),
            );

            if (data.perEntity.length > 0) {
                console.log(chalk.bold("Earnings by Entity:"));
                printTable(
                    data.perEntity.map((r) => ({
                        entity: r.entity_name || r.entity_id,
                        source: r.source,
                        requests: r.requests,
                        pollen: r.pollen_earned != null ? r.pollen_earned.toFixed(2) : "0.00",
                        usd_basis: r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "-",
                    })),
                );
            } else {
                console.log(chalk.dim("No developer earnings in this period."));
            }
        } catch (err) {
            printError(
                `Failed to fetch earnings: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
