import { getPeriodBucketKeys } from "@pollinations/ui";
import type { DailyUsageRecord, UsagePeriodSelection } from "./types";
import type {
    DeveloperEarningsRow,
    DeveloperEarningsTotal,
    EarningsSource,
} from "./use-earnings-data";

type MockUsageEventRecord = {
    timestamp: string;
    cursor_event_id: string;
    model: string | null;
    api_key_id: string | null;
    api_key: string | null;
    meter_source: string | null;
    cost_usd: number;
};

type MockEarningsEventRecord = {
    timestamp: string;
    cursor_event_id: string;
    app_key_id: string;
    app_name: string;
    model: string | null;
    meter_source: string | null;
    pollen_earned: number;
};

type MockEventCursor = {
    timestamp: string;
    eventId: string;
};

type MockEarningsData = {
    daily: DeveloperEarningsRow[];
    perEntity: DeveloperEarningsRow[];
    bySource: DeveloperEarningsRow[];
    total: DeveloperEarningsTotal;
};

type MockEarningsEntity = {
    id: string;
    name: string;
    source: EarningsSource;
    model: string;
    baseRequests: number;
    pollenPerRequest: number;
    rewardRate: number;
    paidShare: number;
};

const MOCK_ACTIVITY_QUERY_PARAM = "mockActivity";
const MOCK_EVENTS_BASE_TIME = Date.now();

const usageKeys = [
    { id: "key_mock_docs", label: "Docs demo key" },
    { id: "key_mock_worker", label: "Worker cron key" },
];

const usageModels = [
    { id: "openai-fast", key: usageKeys[0], source: "tier", base: 96 },
    { id: "flux", key: usageKeys[0], source: "pack", base: 42 },
    { id: "claude-sonnet", key: usageKeys[1], source: "pack", base: 31 },
] as const;

const earningsEntities: MockEarningsEntity[] = [
    {
        id: "key_mock_gallery",
        name: "Image Studio",
        source: "byop_markup",
        model: "flux",
        baseRequests: 54,
        pollenPerRequest: 0.0041,
        rewardRate: 0.18,
        paidShare: 0.72,
    },
    {
        id: "key_mock_chat",
        name: "Study Buddy",
        source: "byop_markup",
        model: "openai-fast",
        baseRequests: 38,
        pollenPerRequest: 0.0034,
        rewardRate: 0.15,
        paidShare: 0.64,
    },
    {
        id: "community/mock-vision",
        name: "mock-vision",
        source: "community_model",
        model: "mock-vision",
        baseRequests: 24,
        pollenPerRequest: 0.0062,
        rewardRate: 0.25,
        paidShare: 0.58,
    },
];

function isTruthyMockValue(value: string | null): boolean {
    return value === "1" || value === "true" || value === "yes";
}

function isFalseyMockValue(value: string | null): boolean {
    return value === "0" || value === "false" || value === "no";
}

export function isActivityMockEnabled(): boolean {
    if (!import.meta.env.DEV || typeof window === "undefined") return false;

    const paramValue = new URLSearchParams(window.location.search)
        .get(MOCK_ACTIVITY_QUERY_PARAM)
        ?.toLowerCase();

    if (isFalseyMockValue(paramValue ?? null)) return false;
    return isTruthyMockValue(paramValue ?? null);
}

function roundPollen(value: number): number {
    return Number(value.toFixed(6));
}

function bucketScale(index: number): number {
    const wave = Math.sin(index * 0.82) + 1.45;
    const pulse = index % 5 === 0 ? 1.4 : 1;
    return wave * pulse;
}

function mockRequests(base: number, bucketIndex: number, rowIndex: number) {
    return Math.max(
        1,
        Math.round(base * bucketScale(bucketIndex) * (1 - rowIndex * 0.14)),
    );
}

function formatUtcTimestamp(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function dateMinutesAgo(minutesAgo: number): Date {
    return new Date(MOCK_EVENTS_BASE_TIME - minutesAgo * 60_000);
}

function timestampMs(value: string): number {
    return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

function mockEarningsRow(
    date: string,
    entity: MockEarningsEntity,
    requests: number,
): DeveloperEarningsRow {
    const pollen = roundPollen(requests * entity.pollenPerRequest);
    const paidEarned = roundPollen(pollen * entity.paidShare);
    const tierEarned = roundPollen(pollen - paidEarned);

    return {
        date,
        entity_id: entity.id,
        entity_name: entity.name,
        source: entity.source,
        requests,
        paid_requests: Math.round(requests * entity.paidShare),
        tier_requests: requests - Math.round(requests * entity.paidShare),
        baseline_price: roundPollen(pollen / entity.rewardRate),
        pollen_earned: pollen,
        paid_earned: paidEarned,
        tier_earned: tierEarned,
        cost_usd: roundPollen(pollen / entity.rewardRate),
        reward_rate: entity.rewardRate,
        unique_users: Math.max(1, Math.round(requests / 9)),
    };
}

function summarizeEarningsRows(
    rows: DeveloperEarningsRow[],
    keyForRow: (row: DeveloperEarningsRow) => string,
    makeBaseRow: (row: DeveloperEarningsRow) => DeveloperEarningsRow,
): DeveloperEarningsRow[] {
    const summaries = new Map<string, DeveloperEarningsRow>();

    for (const row of rows) {
        const key = keyForRow(row);
        const current = summaries.get(key) ?? makeBaseRow(row);
        current.requests += row.requests;
        current.paid_requests =
            (current.paid_requests ?? 0) + (row.paid_requests ?? 0);
        current.tier_requests =
            (current.tier_requests ?? 0) + (row.tier_requests ?? 0);
        current.baseline_price = roundPollen(
            current.baseline_price + row.baseline_price,
        );
        current.pollen_earned = roundPollen(
            current.pollen_earned + row.pollen_earned,
        );
        current.paid_earned = roundPollen(
            (current.paid_earned ?? 0) + (row.paid_earned ?? 0),
        );
        current.tier_earned = roundPollen(
            (current.tier_earned ?? 0) + (row.tier_earned ?? 0),
        );
        current.cost_usd = roundPollen(current.cost_usd + row.cost_usd);
        current.unique_users += row.unique_users;
        current.reward_rate =
            current.baseline_price > 0
                ? roundPollen(current.pollen_earned / current.baseline_price)
                : 0;
        summaries.set(key, current);
    }

    return Array.from(summaries.values()).sort(
        (a, b) => b.pollen_earned - a.pollen_earned,
    );
}

function emptySummaryRow(row: DeveloperEarningsRow): DeveloperEarningsRow {
    return {
        ...row,
        date: "",
        requests: 0,
        paid_requests: 0,
        tier_requests: 0,
        baseline_price: 0,
        pollen_earned: 0,
        paid_earned: 0,
        tier_earned: 0,
        cost_usd: 0,
        unique_users: 0,
    };
}

function totalFromRows(rows: DeveloperEarningsRow[]): DeveloperEarningsTotal {
    return {
        pollen_earned: roundPollen(
            rows.reduce((sum, row) => sum + row.pollen_earned, 0),
        ),
        paid_earned: roundPollen(
            rows.reduce((sum, row) => sum + (row.paid_earned ?? 0), 0),
        ),
        tier_earned: roundPollen(
            rows.reduce((sum, row) => sum + (row.tier_earned ?? 0), 0),
        ),
    };
}

export function getMockDailyUsage(
    period: UsagePeriodSelection,
): DailyUsageRecord[] {
    return getPeriodBucketKeys(period).flatMap((bucketKey, bucketIndex) =>
        usageModels.map((model, rowIndex) => {
            const requests = mockRequests(model.base, bucketIndex, rowIndex);
            const costRate =
                model.source === "tier" ? 0.00052 : 0.00087 + rowIndex * 0.0002;

            return {
                date: bucketKey,
                api_key_id: model.key.id,
                api_key: model.key.label,
                model: model.id,
                meter_source: model.source,
                requests,
                cost_usd: roundPollen(requests * costRate),
            };
        }),
    );
}

export function getMockEarningsData(
    period: UsagePeriodSelection,
    selectedEntityIds: string[],
): MockEarningsData {
    const selectedEntityIdsSet = new Set(selectedEntityIds);
    const includedEntities =
        selectedEntityIds.length > 0
            ? earningsEntities.filter((entity) =>
                  selectedEntityIdsSet.has(entity.id),
              )
            : earningsEntities;

    const daily = getPeriodBucketKeys(period).flatMap(
        (bucketKey, bucketIndex) =>
            includedEntities.map((entity, rowIndex) =>
                mockEarningsRow(
                    bucketKey,
                    entity,
                    mockRequests(entity.baseRequests, bucketIndex, rowIndex),
                ),
            ),
    );
    const perEntity = summarizeEarningsRows(
        daily,
        (row) => `${row.source}:${row.entity_id}`,
        emptySummaryRow,
    );
    const bySource = summarizeEarningsRows(
        daily,
        (row) => row.source,
        (row) => ({
            ...emptySummaryRow(row),
            entity_id: "",
            entity_name: "",
        }),
    );

    return {
        daily,
        perEntity,
        bySource,
        total: totalFromRows(bySource),
    };
}

function getMockUsageEvents(): MockUsageEventRecord[] {
    return Array.from({ length: 28 }, (_, index) => {
        const model = usageModels[index % usageModels.length];
        const minutesAgo = 18 + index * 37;
        const cost = roundPollen(
            (0.004 + (index % 7) * 0.0017) *
                (model.source === "tier" ? 0.65 : 1),
        );

        return {
            timestamp: formatUtcTimestamp(dateMinutesAgo(minutesAgo)),
            cursor_event_id: `mock-usage-${String(index + 1).padStart(3, "0")}`,
            model: model.id,
            api_key_id: model.key.id,
            api_key: model.key.label,
            meter_source: model.source,
            cost_usd: cost,
        };
    });
}

function getMockEarningsEvents(): MockEarningsEventRecord[] {
    return Array.from({ length: 24 }, (_, index) => {
        const entity = earningsEntities[index % earningsEntities.length];
        const minutesAgo = 31 + index * 43;
        const earned = roundPollen(
            0.006 + (index % 6) * 0.0025 + entity.pollenPerRequest * 2,
        );

        return {
            timestamp: formatUtcTimestamp(dateMinutesAgo(minutesAgo)),
            cursor_event_id: `mock-earnings-${String(index + 1).padStart(3, "0")}`,
            app_key_id: entity.id,
            app_name: entity.name,
            model: entity.model,
            meter_source: index % 3 === 0 ? "tier" : "pack",
            pollen_earned: earned,
        };
    });
}

function pageRowsAfterCursor<
    T extends { timestamp: string; cursor_event_id: string },
>(rows: T[], cursor: MockEventCursor | null, limit: number): T[] {
    const sortedRows = [...rows].sort((a, b) => {
        const timeDelta = timestampMs(b.timestamp) - timestampMs(a.timestamp);
        if (timeDelta !== 0) return timeDelta;
        return a.cursor_event_id.localeCompare(b.cursor_event_id);
    });

    if (!cursor) return sortedRows.slice(0, limit);

    const cursorIndex = sortedRows.findIndex(
        (row) =>
            row.timestamp === cursor.timestamp &&
            row.cursor_event_id === cursor.eventId,
    );

    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    return sortedRows.slice(startIndex, startIndex + limit);
}

export function getMockUsageEventRows(
    cursor: MockEventCursor | null,
    limit: number,
): MockUsageEventRecord[] {
    return pageRowsAfterCursor(getMockUsageEvents(), cursor, limit);
}

export function getMockEarningsEventRows(
    cursor: MockEventCursor | null,
    limit: number,
): MockEarningsEventRecord[] {
    return pageRowsAfterCursor(getMockEarningsEvents(), cursor, limit);
}
