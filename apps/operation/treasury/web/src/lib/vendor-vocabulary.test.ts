import { describe, expect, it } from "vitest";
import type { Data, RunRow } from "../types";
import {
    findVendorVocabularyIssues,
    VENDOR_OPTIONS,
    vendorVocabularyRunIssues,
} from "./vendor-vocabulary";

const baseData: Data = {
    transactions: [],
    meterMonthly: [],
    usageMonthly: [],
    runs: [],
    revenueMonthly: [],
};

describe("vendor vocabulary", () => {
    it("uses canonical vendor slugs as filter options", () => {
        expect(VENDOR_OPTIONS[0]).toBe("all");
        expect(VENDOR_OPTIONS).toContain("aws");
        expect(VENDOR_OPTIONS).toContain("vast.ai");
        expect(VENDOR_OPTIONS).not.toContain("bedrock");
    });

    it("reports unknown row vendors without turning aliases into options", () => {
        const issues = findVendorVocabularyIssues({
            ...baseData,
            usageMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    vendor: "new-vendor",
                    model: "model",
                    currency: "POLLEN",
                    cost_paid: 1,
                    cost_quests: 0,
                    price_paid: 1,
                    price_quests: 0,
                },
            ],
        });

        expect(issues).toEqual([
            {
                source: "usage_monthly",
                vendor: "new-vendor",
                detail: 'usage_monthly: unknown vendor "new-vendor" - add an alias or canonical vendor in vendor_aliases.json',
            },
        ]);
    });

    it("extracts vendor errors from the latest ingest run", () => {
        const runs: RunRow[] = [
            {
                run_at: "2026-07-04 12:00:00",
                ok: 0,
                statuses: JSON.stringify({
                    usage: "err:ValueError: unknown vendor slug for usage_monthly: 'new-vendor'",
                }),
                notes: "",
            },
        ];

        expect(vendorVocabularyRunIssues(runs)).toEqual([
            {
                source: "usage",
                vendor: "",
                detail: "usage: err:ValueError: unknown vendor slug for usage_monthly: 'new-vendor'",
            },
        ]);
    });
});
