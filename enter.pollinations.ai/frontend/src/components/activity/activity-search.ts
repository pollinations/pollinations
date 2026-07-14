import { currentPeriod, type PeriodGranularity } from "@pollinations/ui";
import type { Metric } from "./types.ts";

export type ActivitySearch = {
    granularity: PeriodGranularity;
    period: string;
    usageMetric?: Metric;
    usageKeys?: string[];
    usageModels?: string[];
    earningsMetric?: Metric;
    earningsApps?: string[];
    earningsModels?: string[];
};

function isMetric(value: unknown): value is Metric {
    return value === "requests" || value === "pollen";
}

function isPeriod(
    granularity: PeriodGranularity,
    value: unknown,
): value is string {
    if (typeof value !== "string") return false;
    if (granularity === "day") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().startsWith(value)
        );
    }
    if (granularity === "week") {
        return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value);
    }
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parseStringList(value: unknown): string[] | undefined {
    const values = Array.isArray(value) ? value : [value];
    const result = [
        ...new Set(
            values.filter(
                (item): item is string =>
                    typeof item === "string" && item.length > 0,
            ),
        ),
    ];
    return result.length > 0 ? result : undefined;
}

export function validateActivitySearch(
    search: Record<string, unknown>,
): ActivitySearch {
    const fallback = currentPeriod();
    const requestedGranularity =
        search.granularity === "day" ||
        search.granularity === "week" ||
        search.granularity === "month"
            ? search.granularity
            : fallback.granularity;
    let granularity = fallback.granularity;
    let period = fallback.period;
    if (isPeriod(requestedGranularity, search.period)) {
        granularity = requestedGranularity;
        period = search.period;
    }

    return {
        granularity,
        period,
        usageMetric:
            isMetric(search.usageMetric) && search.usageMetric !== "pollen"
                ? search.usageMetric
                : undefined,
        usageKeys: parseStringList(search.usageKeys),
        usageModels: parseStringList(search.usageModels),
        earningsMetric:
            isMetric(search.earningsMetric) &&
            search.earningsMetric !== "pollen"
                ? search.earningsMetric
                : undefined,
        earningsApps: parseStringList(search.earningsApps),
        earningsModels: parseStringList(search.earningsModels),
    };
}
