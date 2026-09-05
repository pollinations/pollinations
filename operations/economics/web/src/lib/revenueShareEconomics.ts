import type { Data, RevenueShareSourceRow } from "../types";
import { toUsd } from "./fx";
import { type MonthFilterValue, matchesMonth, WINDOW_START } from "./months";

export type RevenueShareSource = {
    type: "app" | "model";
    id: string;
    name: string;
    models: string[];
};

export type RevenueShareRow = {
    month: string;
    recipientId: string;
    githubUsername: string;
    recipientName: string;
    sources: RevenueShareSource[];
    appCount: number;
    modelCount: number;
    paidUsageUsd: number;
    paidCreatorEarningsUsd: number;
    paidPollinationsProfitUsd: number;
    paidPerformancePct: number | null;
    questUsageUsd: number;
    questCreatorEarningsUsd: number;
    paidRequests: number;
    questRequests: number;
};

export type RevenueShareSummary = Pick<
    RevenueShareRow,
    | "paidUsageUsd"
    | "paidCreatorEarningsUsd"
    | "paidPollinationsProfitUsd"
    | "paidPerformancePct"
    | "questUsageUsd"
    | "questCreatorEarningsUsd"
    | "paidRequests"
    | "questRequests"
>;

export type RevenueShareLedgerRow = {
    month: string;
    recipientId: string;
    githubUsername: string;
    recipientName: string;
    source: RevenueShareSource;
    paidUsageUsd: number;
    paidCreatorEarningsUsd: number;
    questUsageUsd: number;
    questCreatorEarningsUsd: number;
    paidRequests: number;
    questRequests: number;
};

export type CreatorSettlementRow = {
    entryId: string;
    date: string;
    creator: string;
    amountUsd: number;
    method: string;
    evidence: string;
};

function parseSources(value: string): RevenueShareSource[] {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
        throw new Error("Revenue Share sources must be an array");
    }

    const sources = new Map<string, RevenueShareSource>();
    parsed.forEach((source, index) => {
        if (
            !Array.isArray(source) ||
            source.length !== 4 ||
            (source[0] !== "app" && source[0] !== "model") ||
            source.slice(1).some((field) => typeof field !== "string")
        ) {
            throw new Error(`Revenue Share source ${index} is invalid`);
        }
        const key = `${source[0]}|${source[1]}`;
        const existing: RevenueShareSource = sources.get(key) ?? {
            type: source[0],
            id: source[1] as string,
            name: source[2] as string,
            models: [],
        };
        const model = source[3] as string;
        if (model && !existing.models.includes(model)) {
            existing.models.push(model);
        }
        sources.set(key, existing);
    });

    return [...sources.values()]
        .map((source) => ({
            ...source,
            models: [...source.models].sort(),
        }))
        .sort(
            (a, b) =>
                a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
        );
}

function toRevenueShareRow(source: RevenueShareSourceRow): RevenueShareRow {
    const sources = parseSources(source.sources_json);
    return {
        month: source.month,
        recipientId: source.recipient_id,
        githubUsername: source.github_username,
        recipientName: source.recipient_name,
        sources,
        appCount: sources.filter((item) => item.type === "app").length,
        modelCount: sources.filter((item) => item.type === "model").length,
        paidUsageUsd: source.paid_usage,
        paidCreatorEarningsUsd: source.paid_creator_earnings,
        paidPollinationsProfitUsd: source.paid_pollinations_profit,
        paidPerformancePct:
            source.paid_usage > 0
                ? (source.paid_pollinations_profit / source.paid_usage) * 100
                : null,
        questUsageUsd: source.quest_usage,
        questCreatorEarningsUsd: source.quest_creator_earnings,
        paidRequests: source.paid_requests,
        questRequests: source.quest_requests,
    };
}

export function revenueShareRows(
    data: Data,
    monthFilter: MonthFilterValue,
): RevenueShareRow[] {
    return (data.revenueShare ?? [])
        .filter(
            (row) =>
                row.row_type === "creator" &&
                row.month >= WINDOW_START &&
                matchesMonth(row.month, monthFilter),
        )
        .map(toRevenueShareRow)
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                b.paidPollinationsProfitUsd - a.paidPollinationsProfitUsd ||
                a.recipientName.localeCompare(b.recipientName),
        );
}

export function revenueShareLedgerRows(
    data: Data,
    monthFilter: MonthFilterValue,
): RevenueShareLedgerRow[] {
    return (data.revenueShare ?? [])
        .filter(
            (row) =>
                row.row_type === "source" &&
                row.month >= WINDOW_START &&
                matchesMonth(row.month, monthFilter),
        )
        .map((row) => {
            const sources = parseSources(row.sources_json);
            if (sources.length !== 1) {
                throw new Error(
                    `Revenue Share ledger row must contain one source, received ${sources.length}`,
                );
            }
            return {
                month: row.month,
                recipientId: row.recipient_id,
                githubUsername: row.github_username,
                recipientName: row.recipient_name,
                source: sources[0],
                paidUsageUsd: row.paid_usage,
                paidCreatorEarningsUsd: row.paid_creator_earnings,
                questUsageUsd: row.quest_usage,
                questCreatorEarningsUsd: row.quest_creator_earnings,
                paidRequests: row.paid_requests,
                questRequests: row.quest_requests,
            };
        })
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                b.paidCreatorEarningsUsd - a.paidCreatorEarningsUsd ||
                a.recipientName.localeCompare(b.recipientName) ||
                a.source.name.localeCompare(b.source.name),
        );
}

export function revenueShareSummary(
    data: Data,
    monthFilter: MonthFilterValue,
): RevenueShareSummary {
    const summary: RevenueShareSummary = {
        paidUsageUsd: 0,
        paidCreatorEarningsUsd: 0,
        paidPollinationsProfitUsd: 0,
        paidPerformancePct: null,
        questUsageUsd: 0,
        questCreatorEarningsUsd: 0,
        paidRequests: 0,
        questRequests: 0,
    };

    for (const row of data.revenueShare ?? []) {
        if (
            row.row_type !== "summary" ||
            row.month < WINDOW_START ||
            !matchesMonth(row.month, monthFilter)
        ) {
            continue;
        }
        summary.paidUsageUsd += row.paid_usage;
        summary.paidCreatorEarningsUsd += row.paid_creator_earnings;
        summary.paidPollinationsProfitUsd += row.paid_pollinations_profit;
        summary.questUsageUsd += row.quest_usage;
        summary.questCreatorEarningsUsd += row.quest_creator_earnings;
        summary.paidRequests += row.paid_requests;
        summary.questRequests += row.quest_requests;
    }

    summary.paidPerformancePct =
        summary.paidUsageUsd > 0
            ? (summary.paidPollinationsProfitUsd / summary.paidUsageUsd) * 100
            : null;
    return summary;
}

export function creatorSettlementRows(
    data: Data,
    monthFilter: MonthFilterValue,
): CreatorSettlementRow[] {
    return (data.opTransactions ?? [])
        .filter(
            (row) =>
                row.kind === "transaction" &&
                row.category === "creator_payout" &&
                row.amount < 0 &&
                matchesMonth(row.date, monthFilter),
        )
        .map((row) => ({
            entryId: row.entry_id,
            date: row.date,
            creator: row.vendor,
            amountUsd: Math.abs(
                toUsd(row.amount, row.currency, row.date.slice(0, 7)),
            ),
            method: row.source,
            evidence: row.evidence,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));
}
