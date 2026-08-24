import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { fail, getOutputMode, printResult, printTable } from "../lib/output.js";

type EarningsSource = "byop_markup" | "community_model";

interface EarningsRow {
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

interface EarningsResponse {
    daily: EarningsRow[];
    perEntity: EarningsRow[];
}

const SOURCE_LABEL: Record<EarningsSource, string> = {
    byop_markup: "byop",
    community_model: "community",
};

export interface EarningsEntity {
    entity_id: string;
    entity_name: string;
    source: EarningsSource;
    requests: number;
    pollen_earned: number;
}

export interface EarningsSummary {
    days: number;
    totalPollen: number;
    totalRequests: number;
    entities: EarningsEntity[];
}

export const summarizeEarnings = (
    data: EarningsResponse,
    days: number,
): EarningsSummary => {
    const entities = data.perEntity.map((row) => ({
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        source: row.source,
        requests: row.requests,
        pollen_earned: row.pollen_earned,
    }));
    const totalPollen = entities.reduce(
        (sum, entity) => sum + entity.pollen_earned,
        0,
    );
    const totalRequests = entities.reduce(
        (sum, entity) => sum + entity.requests,
        0,
    );
    return { days, totalPollen, totalRequests, entities };
};

export const parseDays = (value: string): number => {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1) {
        throw new Error("--days must be a positive integer");
    }
    return days;
};

export const earningsCommand = new Command("earnings")
    .description(
        "Show developer earnings (total and per entity) for the authenticated account",
    )
    .option(
        "--days <n>",
        "Number of days of earnings to show (default 30)",
        "30",
    )
    .action(async (opts) => {
        const key = requireKey();
        try {
            const days = parseDays(opts.days);
            const data = await gen<EarningsResponse>(
                `/account/earnings?days=${days}`,
                { apiKey: key },
            );
            const summary = summarizeEarnings(data, days);

            if (getOutputMode() !== "human") {
                printResult(summary);
                return;
            }

            printResult({ "total pollen earned": summary.totalPollen });
            printTable(
                summary.entities.map((entity) => ({
                    source: SOURCE_LABEL[entity.source],
                    entity: entity.entity_name || entity.entity_id,
                    requests: entity.requests,
                    pollen: entity.pollen_earned,
                })),
                ["source", "entity", "requests", "pollen"],
            );
        } catch (err) {
            fail("Failed to fetch earnings", err);
        }
    });
