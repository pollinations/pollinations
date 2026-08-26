import { describe, expect, it } from "vitest";
import {
    backfillPointsflyerEvents,
    checkMigrationProviderCoverage,
    type EventLike,
    PRESERVED_ECONOMICS_BASELINE,
    reconcilePointsflyerEvents,
    validateEventUniqueness,
} from "../src/services/pointsflyer-reconciliation.ts";

/**
 * Mock generator that constructs exact event counts matching the Economics baseline for testing.
 */
function createBaselineEvents(): EventLike[] {
    const events: EventLike[] = [];
    let counter = 1;

    for (const base of PRESERVED_ECONOMICS_BASELINE) {
        // Price per request and cost per request derived from totals
        const pricePerReq = base.expected_price / base.expected_request_count;
        const costPerReq = base.expected_cost / base.expected_request_count;

        for (let i = 0; i < base.expected_request_count; i++) {
            const idStr = `pf-event-${base.month}-${base.model}-${base.meter_type}-${i + 1}`;
            const reqStr = `pf-req-${base.month}-${base.model}-${base.meter_type}-${i + 1}`;

            // Alternate user_id between '' and 'undefined' to test unauthenticated preservation
            const userId = counter % 2 === 0 ? "" : "undefined";
            counter++;

            events.push({
                event_id: idStr,
                request_id: reqStr,
                start_time: `${base.month}-15T12:00:00Z`,
                model_provider_used: "pointsflyer",
                resolved_model_requested: base.model,
                selected_meter_slug: base.meter_slug,
                total_price: pricePerReq,
                total_cost: costPerReq,
                user_id: userId,
                cache_hit: false,
            });
        }
    }

    return events;
}

describe("Pointsflyer Recovery and Migration Cutover Protection", () => {
    // -----------------------------------------------------------------------
    // 1. Pointsflyer events with user_id = '' are retained
    // -----------------------------------------------------------------------
    it("retains Pointsflyer events with user_id = '' during backfill", () => {
        const v1Events: EventLike[] = [
            {
                event_id: "pf-empty-user-1",
                request_id: "req-empty-user-1",
                start_time: "2026-01-10T10:00:00Z",
                model_provider_used: "pointsflyer",
                resolved_model_requested: "openai",
                selected_meter_slug: "v1:meter:pack",
                total_price: 0.002,
                total_cost: 0.001,
                user_id: "",
            },
        ];

        const backfilled = backfillPointsflyerEvents(v1Events, []);
        expect(backfilled).toHaveLength(1);
        expect(backfilled[0].event_id).toBe("pf-empty-user-1");
        expect(backfilled[0].user_id).toBe("");
    });

    // -----------------------------------------------------------------------
    // 2. Pointsflyer events with user_id = 'undefined' are retained
    // -----------------------------------------------------------------------
    it("retains Pointsflyer events with user_id = 'undefined' during backfill", () => {
        const v1Events: EventLike[] = [
            {
                event_id: "pf-undef-user-1",
                request_id: "req-undef-user-1",
                start_time: "2026-02-15T14:00:00Z",
                model_provider_used: "pointsflyer",
                resolved_model_requested: "flux",
                selected_meter_slug: "v1:meter:tier",
                total_price: 0.005,
                total_cost: 0.0025,
                user_id: "undefined",
            },
        ];

        const backfilled = backfillPointsflyerEvents(v1Events, []);
        expect(backfilled).toHaveLength(1);
        expect(backfilled[0].event_id).toBe("pf-undef-user-1");
        expect(backfilled[0].user_id).toBe("undefined");
    });

    // -----------------------------------------------------------------------
    // 3. Non-Pointsflyer historical providers remain retained
    // -----------------------------------------------------------------------
    it("retains non-Pointsflyer historical providers", () => {
        const existingV2: EventLike[] = [
            {
                event_id: "openai-ev-1",
                request_id: "openai-req-1",
                start_time: "2026-01-05T08:00:00Z",
                model_provider_used: "azure-openai",
                resolved_model_requested: "gpt-4o",
                selected_meter_slug: "v1:meter:pack",
                total_price: 0.01,
                total_cost: 0.005,
                user_id: "user-123",
            },
        ];

        const v1Pointsflyer: EventLike[] = [
            {
                event_id: "pf-ev-1",
                request_id: "pf-req-1",
                start_time: "2026-01-06T09:00:00Z",
                model_provider_used: "pointsflyer",
                resolved_model_requested: "openai",
                selected_meter_slug: "v1:meter:pack",
                total_price: 0.002,
                total_cost: 0.001,
                user_id: "",
            },
        ];

        const backfilled = backfillPointsflyerEvents(v1Pointsflyer, existingV2);
        expect(backfilled).toHaveLength(2);
        expect(backfilled.map((e) => e.model_provider_used)).toContain("azure-openai");
        expect(backfilled.map((e) => e.model_provider_used)).toContain("pointsflyer");
    });

    // -----------------------------------------------------------------------
    // 4. Backfill is idempotent
    // -----------------------------------------------------------------------
    it("is fully idempotent when executed multiple times", () => {
        const v1Events = createBaselineEvents().slice(0, 100);

        // First pass
        const firstPass = backfillPointsflyerEvents(v1Events, []);
        expect(firstPass).toHaveLength(100);

        // Second pass with same source
        const secondPass = backfillPointsflyerEvents(v1Events, firstPass);
        expect(secondPass).toHaveLength(100); // No double-counting
    });

    // -----------------------------------------------------------------------
    // 5. Existing Pointsflyer v2 events are not duplicated
    // -----------------------------------------------------------------------
    it("prevents duplication of existing Pointsflyer v2 events", () => {
        const existingV2: EventLike[] = [
            {
                event_id: "pf-existing-1",
                request_id: "req-existing-1",
                start_time: "2026-03-01T12:00:00Z",
                model_provider_used: "pointsflyer",
                resolved_model_requested: "openai",
                selected_meter_slug: "v1:meter:pack",
                total_price: 0.002,
                total_cost: 0.001,
                user_id: "",
            },
        ];

        const v1Events: EventLike[] = [
            ...existingV2,
            {
                event_id: "pf-new-1",
                request_id: "req-new-1",
                start_time: "2026-03-02T12:00:00Z",
                model_provider_used: "pointsflyer",
                resolved_model_requested: "flux",
                selected_meter_slug: "v1:meter:pack",
                total_price: 0.005,
                total_cost: 0.0025,
                user_id: "",
            },
        ];

        const result = backfillPointsflyerEvents(v1Events, existingV2);
        expect(result).toHaveLength(2);
        expect(result.map((e) => e.event_id)).toEqual(["pf-existing-1", "pf-new-1"]);
    });

    // -----------------------------------------------------------------------
    // 6. event_id / request_id uniqueness is preserved
    // -----------------------------------------------------------------------
    it("preserves event_id and request_id uniqueness across backfilled dataset", () => {
        const baselineEvents = createBaselineEvents().slice(0, 500);
        const backfilled = backfillPointsflyerEvents(baselineEvents, []);

        const uniqueness = validateEventUniqueness(backfilled);
        expect(uniqueness.isUnique).toBe(true);
        expect(uniqueness.duplicateCount).toBe(0);
        expect(uniqueness.uniqueEventIds).toBe(500);
        expect(uniqueness.uniqueRequestIds).toBe(500);
    });

    // -----------------------------------------------------------------------
    // 7. January–April aggregate reconciliation produces zero deltas
    // -----------------------------------------------------------------------
    it("reconciles January-April events against the preserved Economics baseline with zero deltas", () => {
        const baselineEvents = createBaselineEvents();
        const backfilled = backfillPointsflyerEvents(baselineEvents, []);

        const reconciliation = reconcilePointsflyerEvents(backfilled);
        expect(reconciliation).toHaveLength(16); // 4 months * 2 models * 2 meters

        for (const row of reconciliation) {
            expect(row.request_count_delta, `Request delta for ${row.month} ${row.model} ${row.meter_type}`).toBe(0);
            expect(row.price_delta, `Price delta for ${row.month} ${row.model} ${row.meter_type}`).toBe(0);
            expect(row.cost_delta, `Cost delta for ${row.month} ${row.model} ${row.meter_type}`).toBe(0);
        }
    });

    // -----------------------------------------------------------------------
    // 8. Cutover check fails if a historical provider disappears from v2
    // -----------------------------------------------------------------------
    it("fails cutover provider coverage check when user_id filter drops unauthenticated provider events", () => {
        const v1Events: EventLike[] = [
            {
                event_id: "pf-cutover-test-1",
                request_id: "req-cutover-test-1",
                start_time: "2026-01-20T10:00:00Z",
                model_provider_used: "pointsflyer",
                user_id: "",
            },
            {
                event_id: "open-cutover-test-1",
                request_id: "req-cutover-test-2",
                start_time: "2026-01-20T10:00:00Z",
                model_provider_used: "openai",
                user_id: "user-456",
            },
        ];

        // Legacy flawed filter from commit 0ceae270b
        const legacyFilter = (ev: EventLike) =>
            ev.user_id !== "" && ev.user_id !== "undefined";

        const legacyCheck = checkMigrationProviderCoverage(v1Events, legacyFilter);
        expect(legacyCheck.passed).toBe(false);
        expect(legacyCheck.droppedProviders).toContain("pointsflyer");

        // Corrected migration filter: preserves provider events even if user_id is empty
        const correctedFilter = (ev: EventLike) =>
            ev.model_provider_used === "pointsflyer" ||
            (ev.user_id !== "" && ev.user_id !== "undefined");

        const correctedCheck = checkMigrationProviderCoverage(v1Events, correctedFilter);
        expect(correctedCheck.passed).toBe(true);
        expect(correctedCheck.droppedProviders).toHaveLength(0);
    });
});
