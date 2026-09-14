/**
 * Pointsflyer Generation Event Recovery & Reconciliation Service
 *
 * Provides the authoritative Economics baseline for January–April 2026,
 * idempotent backfill deduplication, and aggregate reconciliation routines.
 */

export type BaselineEntry = {
    month: string; // YYYY-MM
    model: string; // 'openai' | 'flux'
    meter_slug: string; // 'v1:meter:pack' (Paid) | 'v1:meter:tier' (Quest)
    meter_type: "Paid" | "Quest";
    expected_request_count: number;
    expected_price: number;
    expected_cost: number;
};

export const PRESERVED_ECONOMICS_BASELINE: BaselineEntry[] = [
    // 2026-01
    {
        month: "2026-01",
        model: "openai",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 142500,
        expected_price: 285.0,
        expected_cost: 142.5,
    },
    {
        month: "2026-01",
        model: "openai",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 35800,
        expected_price: 71.6,
        expected_cost: 35.8,
    },
    {
        month: "2026-01",
        model: "flux",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 88200,
        expected_price: 441.0,
        expected_cost: 220.5,
    },
    {
        month: "2026-01",
        model: "flux",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 21400,
        expected_price: 107.0,
        expected_cost: 53.5,
    },

    // 2026-02
    {
        month: "2026-02",
        model: "openai",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 165000,
        expected_price: 330.0,
        expected_cost: 165.0,
    },
    {
        month: "2026-02",
        model: "openai",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 42100,
        expected_price: 84.2,
        expected_cost: 42.1,
    },
    {
        month: "2026-02",
        model: "flux",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 95600,
        expected_price: 478.0,
        expected_cost: 239.0,
    },
    {
        month: "2026-02",
        model: "flux",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 24300,
        expected_price: 121.5,
        expected_cost: 60.75,
    },

    // 2026-03
    {
        month: "2026-03",
        model: "openai",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 180200,
        expected_price: 360.4,
        expected_cost: 180.2,
    },
    {
        month: "2026-03",
        model: "openai",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 48000,
        expected_price: 96.0,
        expected_cost: 48.0,
    },
    {
        month: "2026-03",
        model: "flux",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 102400,
        expected_price: 512.0,
        expected_cost: 256.0,
    },
    {
        month: "2026-03",
        model: "flux",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 26800,
        expected_price: 134.0,
        expected_cost: 67.0,
    },

    // 2026-04
    {
        month: "2026-04",
        model: "openai",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 120000,
        expected_price: 240.0,
        expected_cost: 120.0,
    },
    {
        month: "2026-04",
        model: "openai",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 31200,
        expected_price: 62.4,
        expected_cost: 31.2,
    },
    {
        month: "2026-04",
        model: "flux",
        meter_slug: "v1:meter:pack",
        meter_type: "Paid",
        expected_request_count: 74500,
        expected_price: 372.5,
        expected_cost: 186.25,
    },
    {
        month: "2026-04",
        model: "flux",
        meter_slug: "v1:meter:tier",
        meter_type: "Quest",
        expected_request_count: 18900,
        expected_price: 94.5,
        expected_cost: 47.25,
    },
];

export type EventLike = {
    id?: string;
    event_id?: string;
    requestId?: string;
    request_id?: string;
    startTime?: string | Date;
    start_time?: string | Date;
    resolvedModelRequested?: string;
    resolved_model_requested?: string;
    selectedMeterSlug?: string;
    selected_meter_slug?: string;
    modelProviderUsed?: string;
    model_provider_used?: string;
    totalPrice?: number;
    total_price?: number;
    totalCost?: number;
    total_cost?: number;
    userId?: string;
    user_id?: string;
};

export type ReconciliationRow = {
    month: string;
    model: string;
    meter_type: "Paid" | "Quest";
    expected_request_count: number;
    actual_request_count: number;
    request_count_delta: number;
    expected_price: number;
    actual_price: number;
    price_delta: number;
    expected_cost: number;
    actual_cost: number;
    cost_delta: number;
};

export function getEventId(event: EventLike): string {
    return event.id || event.event_id || "";
}

export function getRequestId(event: EventLike): string {
    return event.requestId || event.request_id || "";
}

export function getStartTime(event: EventLike): string {
    const st = event.startTime || event.start_time;
    if (!st) return "";
    if (st instanceof Date) return st.toISOString();
    return String(st);
}

export function getMonth(event: EventLike): string {
    const st = getStartTime(event);
    if (!st) return "";
    return st.substring(0, 7); // 'YYYY-MM'
}

export function getModel(event: EventLike): string {
    return (
        event.resolvedModelRequested || event.resolved_model_requested || ""
    );
}

export function getMeterSlug(event: EventLike): string {
    return event.selectedMeterSlug || event.selected_meter_slug || "";
}

export function getProvider(event: EventLike): string {
    return event.modelProviderUsed || event.model_provider_used || "";
}

export function getPrice(event: EventLike): number {
    return event.totalPrice ?? event.total_price ?? 0;
}

export function getCost(event: EventLike): number {
    return event.totalCost ?? event.total_cost ?? 0;
}

export function getUserId(event: EventLike): string {
    return event.userId ?? event.user_id ?? "";
}

/**
 * Idempotent backfill merge helper.
 * Selects only those v1 Pointsflyer events for Jan-Apr 2026 that are not
 * already present in existingV2Events (checked by event_id / request_id).
 */
export function backfillPointsflyerEvents(
    v1Events: EventLike[],
    existingV2Events: EventLike[],
): EventLike[] {
    const existingIds = new Set<string>();
    for (const ev of existingV2Events) {
        const eid = getEventId(ev);
        const reqId = getRequestId(ev);
        if (eid) existingIds.add(eid);
        if (reqId) existingIds.add(reqId);
    }

    const newToInsert: EventLike[] = [];
    const seenNew = new Set<string>();

    for (const ev of v1Events) {
        const startTime = getStartTime(ev);
        const provider = getProvider(ev);

        // Filter: start_time >= 2026-01-01 AND start_time < 2026-05-01 AND model_provider_used = 'pointsflyer'
        if (
            startTime >= "2026-01-01" &&
            startTime < "2026-05-01" &&
            provider === "pointsflyer"
        ) {
            const eid = getEventId(ev);
            const reqId = getRequestId(ev);
            const key = eid || reqId;

            if (key && !existingIds.has(key) && !seenNew.has(key)) {
                seenNew.add(key);
                newToInsert.push(ev);
            }
        }
    }

    return [...existingV2Events, ...newToInsert];
}

/**
 * Validates uniqueness of event_id and request_id in an event array.
 */
export function validateEventUniqueness(events: EventLike[]): {
    isUnique: boolean;
    totalEvents: number;
    uniqueEventIds: number;
    uniqueRequestIds: number;
    duplicateCount: number;
} {
    const eventIdSet = new Set<string>();
    const requestIdSet = new Set<string>();
    let duplicateCount = 0;

    for (const ev of events) {
        const eid = getEventId(ev);
        const reqId = getRequestId(ev);
        let dup = false;

        if (eid) {
            if (eventIdSet.has(eid)) dup = true;
            else eventIdSet.add(eid);
        }

        if (reqId) {
            if (requestIdSet.has(reqId)) dup = true;
            else requestIdSet.add(reqId);
        }

        if (dup) duplicateCount++;
    }

    return {
        isUnique: duplicateCount === 0,
        totalEvents: events.length,
        uniqueEventIds: eventIdSet.size,
        uniqueRequestIds: requestIdSet.size,
        duplicateCount,
    };
}

/**
 * Reconciles generation_event_v2 Pointsflyer events against the 16 month/model/meter baseline entries.
 */
export function reconcilePointsflyerEvents(
    events: EventLike[],
): ReconciliationRow[] {
    const pointsflyerEvents = events.filter((ev) => {
        const st = getStartTime(ev);
        const prov = getProvider(ev);
        return (
            prov === "pointsflyer" &&
            st >= "2026-01-01" &&
            st < "2026-05-01"
        );
    });

    const actualMap = new Map<
        string,
        { count: number; price: number; cost: number }
    >();

    for (const ev of pointsflyerEvents) {
        const month = getMonth(ev);
        const model = getModel(ev);
        const meterSlug = getMeterSlug(ev);
        const key = `${month}|${model}|${meterSlug}`;

        const existing = actualMap.get(key) || {
            count: 0,
            price: 0,
            cost: 0,
        };
        actualMap.set(key, {
            count: existing.count + 1,
            price: existing.price + getPrice(ev),
            cost: existing.cost + getCost(ev),
        });
    }

    return PRESERVED_ECONOMICS_BASELINE.map((base) => {
        const key = `${base.month}|${base.model}|${base.meter_slug}`;
        const actual = actualMap.get(key) || {
            count: 0,
            price: 0,
            cost: 0,
        };

        function norm(n: number): number {
            const r = Math.round(n * 100) / 100;
            return Object.is(r, -0) ? 0 : r;
        }

        const request_count_delta =
            actual.count - base.expected_request_count;
        const price_delta = norm(actual.price - base.expected_price);
        const cost_delta = norm(actual.cost - base.expected_cost);

        return {
            month: base.month,
            model: base.model,
            meter_type: base.meter_type,
            expected_request_count: base.expected_request_count,
            actual_request_count: actual.count,
            request_count_delta,
            expected_price: base.expected_price,
            actual_price: norm(actual.price),
            price_delta,
            expected_cost: base.expected_cost,
            actual_cost: norm(actual.cost),
            cost_delta,
        };
    });
}

/**
 * Migration guardrail check.
 * Verifies that a migration pipeline selection filter does NOT drop a historical
 * provider simply because user_id is '' or 'undefined'.
 */
export function checkMigrationProviderCoverage(
    v1Events: EventLike[],
    v2FilterPredicate: (event: EventLike) => boolean,
): {
    passed: boolean;
    droppedProviders: string[];
    details: Record<string, { totalV1: number; retainedV2: number }>;
} {
    const v1ProviderCounts = new Map<string, number>();
    const v2ProviderCounts = new Map<string, number>();

    for (const ev of v1Events) {
        const prov = getProvider(ev);
        if (!prov) continue;
        v1ProviderCounts.set(prov, (v1ProviderCounts.get(prov) || 0) + 1);

        if (v2FilterPredicate(ev)) {
            v2ProviderCounts.set(prov, (v2ProviderCounts.get(prov) || 0) + 1);
        }
    }

    const droppedProviders: string[] = [];
    const details: Record<string, { totalV1: number; retainedV2: number }> = {};

    for (const [prov, count] of v1ProviderCounts.entries()) {
        const retained = v2ProviderCounts.get(prov) || 0;
        details[prov] = { totalV1: count, retainedV2: retained };
        if (count > 0 && retained === 0) {
            droppedProviders.push(prov);
        }
    }

    return {
        passed: droppedProviders.length === 0,
        droppedProviders,
        details,
    };
}
