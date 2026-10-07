import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";

interface EarningsRow {
    date: string;
    entity_id: string;
    entity_name: string;
    source: string;
    requests: number;
    baseline_price: number;
    pollen_earned: number;
    paid_earned: number;
    tier_earned: number;
    cost_usd: number;
    reward_rate: number;
}

interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

export type { EarningsRow };

export function totalPollenEarned(perEntity: EarningsRow[]): number {
    return perEntity.reduce((sum, row) => sum + row.pollen_earned, 0);
}

export const earningsCommand = new Command("earnings")
    .description("Show developer earnings from BYOP apps and community models")
    .option("--days <n>", "Rolling window in days", "30")
    .action(async (opts) => {
        const key = requireKey();
        const days = opts.days;

        try {
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );

            if (getOutputMode() !== "human") {
                printResult({ daily: data.daily, perEntity: data.perEntity });
                return;
            }

            if (data.perEntity.length === 0) {
                printInfo(`No earnings in the last ${days} days.`);
                return;
            }

            const total = totalPollenEarned(data.perEntity);
            printResult({
                total_pollen: total.toFixed(4),
                window_days: days,
            });
            printTable(
                data.perEntity.map((row) => ({
                    entity: row.entity_name,
                    source: row.source,
                    requests: row.requests,
                    pollen: row.pollen_earned.toFixed(4),
                    volume: `$${row.cost_usd.toFixed(2)}`,
                })),
            );
        } catch (err) {
            fail("Failed to fetch earnings", err);
        }
    });
