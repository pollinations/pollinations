import { getPeriodBucketKeys, periodBucketKeyToDate } from "@pollinations/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accountClient } from "../../api.ts";
import { downloadActivityCsv } from "./activity-csv";
import { downloadFile, formatActivityChartDate } from "./activity-helpers";
import {
    type ActivityPeriod,
    activityTimezone,
    isInActivityBucket,
} from "./activity-period";
import type {
    DailyUsageRecord,
    DataPoint,
    DeveloperEarningsRow,
    Metric,
} from "./types";

export type ActivityTab = "usage" | "earnings";
export type ActivityGroup = "model" | "key";
export type PickList = "keys" | "models";
export type Picks = Record<PickList, string[]>;

/** Unknown meters count in the totals but neither as Paid nor as Quest. */
export type ActivityAmounts = {
    pollen: number;
    requests: number;
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
};

/**
 * A fetched row in the shape both tabs share. Usage rows have a key and a
 * model; earnings rows are either an app (its key) or a community model.
 */
export type ActivityRow = ActivityAmounts & {
    date: string;
    key?: string;
    keyName?: string;
    model?: string;
    modelName?: string;
};

/** A table row: one key, model or app, and the pick list it toggles. */
export type BreakdownEntry = ActivityAmounts & {
    id: string;
    label: string;
    list: PickList;
    value: string;
    selected: boolean;
};

const AMOUNTS = [
    "pollen",
    "requests",
    "paidPollen",
    "tierPollen",
    "paidRequests",
    "tierRequests",
] as const;

const PICK_FIELDS = { keys: "key", models: "model" } as const;

const DETAILED_USAGE_DOWNLOAD_LIMIT = 50_000;

const EARNINGS_CSV_COLUMNS = [
    "date",
    "source",
    "entity_id",
    "entity_name",
    "requests",
    "paid_requests",
    "tier_requests",
    "baseline_price",
    "pollen_earned",
    "paid_earned",
    "tier_earned",
    "cost_usd",
    "reward_rate",
] as const;

export function usageRow(row: DailyUsageRecord): ActivityRow {
    const pollen = row.cost_usd || 0;
    const requests = row.requests || 0;
    const paid = row.meter_source === "pack";
    const tier = row.meter_source === "tier";
    return {
        date: row.date,
        key: row.api_key_id,
        keyName: row.api_key || "Unnamed key",
        model: row.model ?? "",
        modelName: row.model || "Unknown model",
        pollen,
        requests,
        paidPollen: paid ? pollen : 0,
        tierPollen: tier ? pollen : 0,
        paidRequests: paid ? requests : 0,
        tierRequests: tier ? requests : 0,
    };
}

export function earningsRow(row: DeveloperEarningsRow): ActivityRow {
    return {
        date: row.date,
        ...(row.source === "byop_markup"
            ? { key: row.entity_id, keyName: row.entity_name || "Unnamed app" }
            : { model: row.entity_id, modelName: row.entity_name }),
        pollen: row.pollen_earned,
        requests: row.requests,
        paidPollen: row.paid_earned,
        tierPollen: row.tier_earned,
        paidRequests: row.paid_requests,
        tierRequests: row.tier_requests,
    };
}

type PeriodQuery = {
    granularity: ActivityPeriod["granularity"];
    period: string;
    timezone: string;
};

type Loaded = { rows: ActivityRow[]; download?: () => Promise<void> };

export const ACTIVITY_SOURCES: Record<
    ActivityTab,
    {
        path: string;
        load: (query: PeriodQuery, signal: AbortSignal) => Promise<Loaded>;
    }
> = {
    usage: {
        path: "/account/usage/daily",
        load: async (query, signal) => {
            const response = await accountClient.usage.daily.$get(
                { query },
                { init: { signal } },
            );
            if (!response.ok)
                throw new Error(`Failed to load usage: ${response.status}`);
            const { usage } = (await response.json()) as {
                usage: DailyUsageRecord[];
            };
            return {
                rows: usage.map(usageRow),
                // Lists every request, so the server builds it.
                download: () =>
                    accountClient.usage
                        .$get({
                            query: {
                                ...query,
                                format: "csv",
                                limit: DETAILED_USAGE_DOWNLOAD_LIMIT.toString(),
                            },
                        })
                        .then(downloadFile),
            };
        },
    },
    earnings: {
        path: "/account/earnings",
        load: async (query, signal) => {
            const response = await accountClient.earnings.$get(
                { query },
                { init: { signal } },
            );
            if (!response.ok)
                throw new Error(`Failed to load earnings: ${response.status}`);
            const { daily } = (await response.json()) as {
                daily: DeveloperEarningsRow[];
            };
            return {
                rows: daily.map(earningsRow),
                download: async () =>
                    downloadActivityCsv(
                        `earnings-${query.period}`,
                        EARNINGS_CSV_COLUMNS,
                        daily,
                    ),
            };
        },
    },
};

function emptyAmounts(): ActivityAmounts {
    return {
        pollen: 0,
        requests: 0,
        paidPollen: 0,
        tierPollen: 0,
        paidRequests: 0,
        tierRequests: 0,
    };
}

function addAmounts(total: ActivityAmounts, row: ActivityAmounts): void {
    for (const amount of AMOUNTS) total[amount] += row[amount];
}

/**
 * Whether a row survives the picks in `lists`. Usage rows have a key and a
 * model, so picks in both lists narrow each other; an earnings row is an app
 * or a model, so picks add up.
 */
function isPicked(
    tab: ActivityTab,
    row: ActivityRow,
    picks: Picks,
    lists: readonly PickList[],
): boolean {
    const hits = lists
        .filter((list) => picks[list].length > 0)
        .map((list) => {
            const value = row[PICK_FIELDS[list]];
            return value !== undefined && picks[list].includes(value);
        });
    if (hits.length === 0) return true;
    return tab === "usage" ? hits.every(Boolean) : hits.some(Boolean);
}

/** Key and app names, with the id added when two share a name. */
function keyLabels(rows: ActivityRow[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const row of rows)
        if (row.key !== undefined && !names.has(row.key))
            names.set(row.key, row.keyName ?? row.key);
    const counts = new Map<string, number>();
    for (const name of names.values())
        counts.set(name, (counts.get(name) ?? 0) + 1);
    return new Map(
        Array.from(names, ([id, name]) => [
            id,
            (counts.get(name) ?? 0) > 1 ? `${name} (${id})` : name,
        ]),
    );
}

export type ActivityView = {
    tab: ActivityTab;
    period: ActivityPeriod;
    metric: Metric;
    group: ActivityGroup;
    picks: Picks;
};

export function useActivityData({
    tab,
    period,
    metric,
    group,
    picks,
}: ActivityView) {
    const { granularity, period: name } = period;
    const requestKey = `${tab}:${granularity}:${name}`;
    const [result, setResult] = useState<(Loaded & { key: string }) | null>(
        null,
    );
    const [status, setStatus] = useState({
        key: requestKey,
        pending: true,
        error: null as string | null,
    });
    const request = useRef<AbortController | null>(null);
    const loaded = result?.key === requestKey ? result : undefined;
    const pending = status.key !== requestKey || status.pending;

    const retry = useCallback(() => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setStatus({ key: requestKey, pending: true, error: null });
        ACTIVITY_SOURCES[tab]
            .load(
                { granularity, period: name, timezone: activityTimezone() },
                controller.signal,
            )
            .then((data) => {
                if (controller.signal.aborted) return;
                setResult({ key: requestKey, ...data });
                setStatus({ key: requestKey, pending: false, error: null });
            })
            .catch((error) => {
                if (!controller.signal.aborted)
                    setStatus({
                        key: requestKey,
                        pending: false,
                        error: error.message || `Couldn’t load ${tab}.`,
                    });
            });
    }, [tab, granularity, name, requestKey]);

    useEffect(() => {
        retry();
        return () => request.current?.abort();
    }, [retry]);

    const rows = loaded?.rows;
    const { chartData, totals, entries, selecting } = useMemo(() => {
        const allRows = rows ?? [];
        const labels = keyLabels(allRows);
        const picked = allRows.filter((row) =>
            isPicked(tab, row, picks, ["keys", "models"]),
        );

        const byDate = new Map<string, ActivityAmounts>();
        for (const row of picked) {
            const day = byDate.get(row.date) ?? emptyAmounts();
            addAmounts(day, row);
            byDate.set(row.date, day);
        }
        const [paidAmount, tierAmount] =
            metric === "pollen"
                ? (["paidPollen", "tierPollen"] as const)
                : (["paidRequests", "tierRequests"] as const);
        const chartData: DataPoint[] = getPeriodBucketKeys(period).map(
            (bucketKey) => {
                const date = periodBucketKeyToDate(bucketKey, granularity);
                const day = byDate.get(bucketKey) ?? emptyAmounts();
                return {
                    ...formatActivityChartDate(date, granularity === "day"),
                    value: day[metric],
                    paidValue: day[paidAmount],
                    tierValue: day[tierAmount],
                    timestamp: date,
                };
            },
        );

        const totals = emptyAmounts();
        for (const row of picked)
            if (isInActivityBucket(row.date, period)) addAmounts(totals, row);

        // Usage tables list one dimension and stay narrowed by the other one's
        // picks; the earnings table lists everything that earned.
        const shownList: PickList = group === "key" ? "keys" : "models";
        const narrowedBy: PickList[] =
            tab === "usage" ? [shownList === "keys" ? "models" : "keys"] : [];
        const byEntry = new Map<string, BreakdownEntry>();
        for (const row of allRows) {
            if (
                !isInActivityBucket(row.date, period) ||
                !isPicked(tab, row, picks, narrowedBy)
            )
                continue;
            const list: PickList =
                tab === "usage"
                    ? shownList
                    : row.key === undefined
                      ? "models"
                      : "keys";
            const value = (list === "keys" ? row.key : row.model) ?? "";
            const id = `${list}:${value}`;
            const entry = byEntry.get(id) ?? {
                id,
                label:
                    list === "keys"
                        ? (labels.get(value) ?? value)
                        : (row.modelName ?? value),
                list,
                value,
                selected: picks[list].includes(value),
                ...emptyAmounts(),
            };
            addAmounts(entry, row);
            byEntry.set(id, entry);
        }
        const entries = Array.from(byEntry.values()).sort(
            (a, b) => b[metric] - a[metric],
        );
        const listed: PickList[] =
            tab === "usage" ? [shownList] : ["keys", "models"];
        const selecting = listed.some((list) => picks[list].length > 0);
        return { chartData, totals, entries, selecting };
    }, [rows, tab, picks, metric, period, granularity, group]);

    return {
        loading: pending && !loaded,
        refreshing: pending && Boolean(loaded),
        error: status.key === requestKey ? status.error : null,
        retry,
        download: loaded?.download,
        hasData: Boolean(rows?.length),
        chartData,
        totals,
        entries,
        selecting,
    };
}
