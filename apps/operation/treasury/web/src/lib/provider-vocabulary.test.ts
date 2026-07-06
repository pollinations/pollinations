import { describe, expect, it } from "vitest";
import type { Data, RunRow } from "../types";
import {
    findProviderVocabularyIssues,
    PROVIDER_OPTIONS,
    providerVocabularyRunIssues,
} from "./provider-vocabulary";

const baseData: Data = {
    transactions: [],
    meterMonthly: [],
    usageMonthly: [],
    runs: [],
    revenueMonthly: [],
};

describe("provider vocabulary", () => {
    it("uses canonical provider slugs as filter options", () => {
        expect(PROVIDER_OPTIONS[0]).toBe("all");
        expect(PROVIDER_OPTIONS).toContain("aws");
        expect(PROVIDER_OPTIONS).toContain("vast.ai");
        expect(PROVIDER_OPTIONS).not.toContain("bedrock");
    });

    it("reports unknown row providers without turning aliases into options", () => {
        const issues = findProviderVocabularyIssues({
            ...baseData,
            usageMonthly: [
                {
                    source: "tinybird",
                    month: "2026-06",
                    provider: "new-provider",
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
                provider: "new-provider",
                detail: 'usage_monthly: unknown provider "new-provider" - add an alias or canonical provider in provider_aliases.json',
            },
        ]);
    });

    it("extracts provider errors from the latest ingest run", () => {
        const runs: RunRow[] = [
            {
                run_at: "2026-07-04 12:00:00",
                ok: 0,
                statuses: JSON.stringify({
                    usage: "err:ValueError: unknown provider slug for usage_monthly: 'new-provider'",
                }),
                notes: "",
            },
        ];

        expect(providerVocabularyRunIssues(runs)).toEqual([
            {
                source: "usage",
                provider: "",
                detail: "usage: err:ValueError: unknown provider slug for usage_monthly: 'new-provider'",
            },
        ]);
    });
});
