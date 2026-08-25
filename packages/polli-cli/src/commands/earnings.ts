import { Command, InvalidArgumentError } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    fail,
    getOutputMode,
    printInfo,
    printResult,
    printTable,
} from "../lib/output.js";

export const MAX_EARNINGS_DAYS = 90;
const DEFAULT_EARNINGS_DAYS = 30;

export interface EarningsRow {
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

export interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

export interface EarningsTotals {
    requests: number;
    paid_requests: number;
    tier_requests: number;
    pollen_earned: number;
    cost_usd: number;
}

/** Additive totals across per-entity rollups. */
export function summarizeEarnings(response: EarningsResponse): EarningsTotals {
    const rows = response.perEntity ?? [];
    return rows.reduce<EarningsTotals>(
        (totals, row) => ({
            requests: totals.requests + row.requests,
            paid_requests: totals.paid_requests + row.paid_requests,
            tier_requests: totals.tier_requests + row.tier_requests,
            pollen_earned: totals.pollen_earned + row.pollen_earned,
            cost_usd: totals.cost_usd + row.cost_usd,
        }),
        {
            requests: 0,
            paid_requests: 0,
            tier_requests: 0,
            pollen_earned: 0,
            cost_usd: 0,
        },
    );
}

/** Parse and validate a --days value; returns null when invalid. */
export function parseEarningsDays(value: string): number | null {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > MAX_EARNINGS_DAYS) {
        return null;
    }
    return days;
}

function renderHuman(
    days: number,
    totals: EarningsTotals,
    perEntity: EarningsRow[],
): void {
    if (perEntity.length === 0) {
        printInfo(`No earnings in the last ${days} day(s).`);
        return;
    }

    printInfo(
        `${totals.pollen_earned.toFixed(4)} pollen earned from ${totals.requests} request(s) in the last ${days} day(s)`,
    );
    printTable(
        perEntity.map((row) => ({
            entity: row.entity_name,
            source: row.source,
            requests: row.requests,
            earned: row.pollen_earned.toFixed(4),
            basis_usd: row.cost_usd.toFixed(2),
            rate: `${(row.reward_rate * 100).toFixed(1)}%`,
        })),
        ["entity", "source", "requests", "earned", "basis_usd", "rate"],
    );
}

const parseDays = (value: string): number => {
    const days = parseEarningsDays(value);
    if (days === null) {
        throw new InvalidArgumentError(
            `must be an integer between 1 and ${MAX_EARNINGS_DAYS}`,
        );
    }
    return days;
};

export const earningsCommand = new Command("earnings")
    .description("Show developer earnings from BYOP apps and community models")
    .option(
        "--days <n>",
        `Rolling window in days (1-${MAX_EARNINGS_DAYS}, default ${DEFAULT_EARNINGS_DAYS})`,
        parseDays,
        DEFAULT_EARNINGS_DAYS,
    )
    .action(async (opts) => {
        try {
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${opts.days}`,
                { apiKey: requireKey() },
            );

            if (getOutputMode() === "json") {
                printResult({
                    days: opts.days,
                    totals: summarizeEarnings(data),
                    perEntity: data.perEntity ?? [],
                });
                return;
            }

            renderHuman(
                opts.days,
                summarizeEarnings(data),
                data.perEntity ?? [],
            );
        } catch (err) {
            fail("Failed to fetch earnings", err);
        }
    });
