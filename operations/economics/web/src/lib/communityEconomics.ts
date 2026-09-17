import type { Data } from "../types";
import { toUsd } from "./fx";
import { type MonthFilterValue, matchesMonth, WINDOW_START } from "./months";
import { canonicalVendor } from "./tb";

const MONTH_KEY = /^\d{4}-\d{2}$/;

export type CommunityEconomicsRow = {
    month: string;
    model: string;
    paidPollenUsd: number;
    byopPaidShareUsd: number;
    ownerPaidShareUsd: number;
    retainedPaidUsd: number;
    retainedPct: number | null;
    questPollenUsd: number;
    ownerQuestRewardUsd: number;
    paidRequests: number;
    questRequests: number;
};

export type CommunityEconomicsSummary = Omit<
    CommunityEconomicsRow,
    "model" | "month" | "retainedPct"
> & {
    retainedPct: number | null;
};

export function communityEconomicsRows(
    data: Data,
    monthFilter: MonthFilterValue,
): CommunityEconomicsRow[] {
    const rows = new Map<string, CommunityEconomicsRow>();

    for (const source of data.opPollen ?? []) {
        if (
            canonicalVendor(source.vendor) !== "community" ||
            !MONTH_KEY.test(source.month) ||
            source.month < WINDOW_START ||
            !matchesMonth(source.month, monthFilter)
        ) {
            continue;
        }

        const model = source.model.trim() || "Unassigned community model";
        const key = `${source.month}|${model}`;
        const row = rows.get(key) ?? {
            month: source.month,
            model,
            paidPollenUsd: 0,
            byopPaidShareUsd: 0,
            ownerPaidShareUsd: 0,
            retainedPaidUsd: 0,
            retainedPct: null,
            questPollenUsd: 0,
            ownerQuestRewardUsd: 0,
            paidRequests: 0,
            questRequests: 0,
        };
        row.paidPollenUsd += toUsd(
            source.price_paid,
            source.currency,
            source.month,
        );
        row.byopPaidShareUsd += toUsd(
            source.byop_paid,
            source.currency,
            source.month,
        );
        row.ownerPaidShareUsd += toUsd(
            source.model_paid,
            source.currency,
            source.month,
        );
        row.retainedPaidUsd += toUsd(
            source.price_paid - source.byop_paid - source.model_paid,
            source.currency,
            source.month,
        );
        row.questPollenUsd += toUsd(
            source.price_quests,
            source.currency,
            source.month,
        );
        row.ownerQuestRewardUsd += toUsd(
            source.model_quests,
            source.currency,
            source.month,
        );
        row.paidRequests += source.requests_paid;
        row.questRequests += source.requests_quests;
        rows.set(key, row);
    }

    return [...rows.values()]
        .map((row) => ({
            ...row,
            retainedPct:
                row.paidPollenUsd > 0
                    ? (row.retainedPaidUsd / row.paidPollenUsd) * 100
                    : null,
        }))
        .sort(
            (a, b) =>
                b.month.localeCompare(a.month) ||
                b.paidPollenUsd - a.paidPollenUsd ||
                a.model.localeCompare(b.model),
        );
}

export function communityEconomicsSummary(
    rows: readonly CommunityEconomicsRow[],
): CommunityEconomicsSummary {
    const summary: CommunityEconomicsSummary = {
        paidPollenUsd: 0,
        byopPaidShareUsd: 0,
        ownerPaidShareUsd: 0,
        retainedPaidUsd: 0,
        retainedPct: null,
        questPollenUsd: 0,
        ownerQuestRewardUsd: 0,
        paidRequests: 0,
        questRequests: 0,
    };
    for (const row of rows) {
        summary.paidPollenUsd += row.paidPollenUsd;
        summary.byopPaidShareUsd += row.byopPaidShareUsd;
        summary.ownerPaidShareUsd += row.ownerPaidShareUsd;
        summary.retainedPaidUsd += row.retainedPaidUsd;
        summary.questPollenUsd += row.questPollenUsd;
        summary.ownerQuestRewardUsd += row.ownerQuestRewardUsd;
        summary.paidRequests += row.paidRequests;
        summary.questRequests += row.questRequests;
    }
    summary.retainedPct =
        summary.paidPollenUsd > 0
            ? (summary.retainedPaidUsd / summary.paidPollenUsd) * 100
            : null;
    return summary;
}
