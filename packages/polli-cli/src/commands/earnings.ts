import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printResult,
    printTable,
} from "../lib/output.js";

export interface EarningsRow {
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

export interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

/** Validate the --days option; returns an error message when invalid. */
export function daysError(days: string): string | null {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1) {
        return "--days must be a positive integer";
    }
    if (n > 90) {
        return "--days must be 90 or less (API limit)";
    }
    return null;
}

/** Roll the daily buckets into additive totals per earning source. */
export function summarizeBySource(daily: EarningsRow[]): {
    source: string;
    requests: number;
    pollenEarned: number;
    usdBasis: number;
}[] {
    const bySource = new Map<
        string,
        { requests: number; pollenEarned: number; usdBasis: number }
    >();
    for (const row of daily) {
        const agg = bySource.get(row.source) ?? {
            requests: 0,
            pollenEarned: 0,
            usdBasis: 0,
        };
        agg.requests += row.requests;
        agg.pollenEarned += row.pollen_earned;
        agg.usdBasis += row.cost_usd;
        bySource.set(row.source, agg);
    }
    return [...bySource.entries()].map(([source, agg]) => ({
        source,
        ...agg,
    }));
}

export const earningsCommand = new Command("earnings")
    .description(
        "Show your Pollinations earnings from BYOP apps and community models",
    )
    .option("--days <n>", "Number of days to include", "30")
    .action(async (opts) => {
        const key = requireKey();
        const err = daysError(opts.days);
        if (err) {
            printError(err);
            process.exit(1);
        }

        try {
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${opts.days}`,
                { apiKey: key },
            );

            if (getOutputMode() === "json") {
                printResult({ daily: data.daily, perEntity: data.perEntity });
                return;
            }

            const total = data.perEntity.reduce(
                (sum, e) => sum + e.pollen_earned,
                0,
            );
            const summary = summarizeBySource(data.daily);
            console.log(
                chalk.bold(
                    `Earned ${total.toFixed(4)} pollen in the last ${opts.days} day(s)`,
                ),
            );

            if (summary.length > 0) {
                console.log();
                printTable(
                    summary.map((s) => ({
                        source: s.source,
                        requests: s.requests,
                        "pollen earned": s.pollenEarned.toFixed(4),
                        "usd basis": `$${s.usdBasis.toFixed(4)}`,
                    })),
                );
            }

            if (data.perEntity.length > 0) {
                console.log(chalk.dim("\nBy app / community model:"));
                printTable(
                    data.perEntity.map((e) => ({
                        name: e.entity_name,
                        type: e.source,
                        requests: e.requests,
                        earned: e.pollen_earned.toFixed(4),
                    })),
                    ["name", "type", "requests", "earned"],
                );
            }
        } catch (e) {
            printError(
                `Failed to fetch earnings: ${e instanceof Error ? e.message : "unknown"}`,
            );
            process.exit(1);
        }
    });
