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

export interface EarningsRow {
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
}

export interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

export function earningsSummary(perEntity: EarningsRow[]): {
    totalPollen: number;
    totalRequests: number;
} {
    return {
        totalPollen: perEntity.reduce((sum, r) => sum + r.pollen_earned, 0),
        totalRequests: perEntity.reduce((sum, r) => sum + r.requests, 0),
    };
}

export function earningsTableRows(
    perEntity: EarningsRow[],
): Record<string, unknown>[] {
    return perEntity.map((r) => ({
        entity: r.entity_name || r.entity_id,
        type: r.source === "byop_markup" ? "app" : "model",
        requests: r.requests,
        pollen: r.pollen_earned.toFixed(4),
    }));
}

export const earningsCommand = new Command("earnings")
    .description("Show developer earnings from BYOP apps and community models")
    .option("--days <n>", "Days to look back (1–90)", "90")
    .action(async (opts) => {
        const key = requireKey();

        const days = Number(opts.days);
        if (!Number.isInteger(days) || days < 1 || days > 90) {
            printError("--days must be an integer between 1 and 90");
            process.exit(1);
        }

        try {
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );

            if (getOutputMode() !== "human") {
                printResult(data as unknown as Record<string, unknown>);
                return;
            }

            const perEntity = data.perEntity ?? [];
            const { totalPollen, totalRequests } = earningsSummary(perEntity);

            process.stdout.write(
                `${chalk.bold("pollen")}: ${chalk.green(totalPollen.toFixed(4))}\n`,
            );
            process.stdout.write(
                `${chalk.bold("requests")}: ${totalRequests}\n\n`,
            );

            if (perEntity.length === 0) {
                process.stdout.write(
                    chalk.dim("No earnings in the selected period.\n"),
                );
                return;
            }

            printTable(earningsTableRows(perEntity));
        } catch (err) {
            printError(
                `Failed to fetch earnings: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
