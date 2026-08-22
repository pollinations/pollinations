import { describe, expect, it } from "vitest";
import type { Data, OpCloudRow, OpTransactionRow } from "../types";
import { ledgerFacets } from "./filterFacets";

const transaction = (
    vendor: string,
    category: string,
    date = "2026-07-10",
): OpTransactionRow => ({
    entry_id: `${date}-${vendor}-${category}`,
    source: "wise",
    date,
    vendor,
    category,
    amount: -1,
    currency: "USD",
    description: "",
    evidence: "",
    recorded_at: "2026-08-01 00:00:00",
});

const cloud = (vendor: string, type: string): OpCloudRow => ({
    entry_id: `${vendor}-${type}`,
    source: "api",
    vendor,
    type,
    start: "2026-07-01 00:00:00",
    end: "2026-08-01 00:00:00",
    credit: 0,
    paid: -1,
    currency: "USD",
    resource_id: "",
    resource_name: "",
    resource_sku: "",
    resource_count: 1,
    model: "",
    evidence: "",
    recorded_at: "2026-08-01 00:00:00",
});

const selection = {
    month: "2026-07",
    vendors: [] as string[],
    categories: [] as string[],
    types: [] as string[],
};

describe("ledgerFacets", () => {
    it("facets transaction vendors by category and categories by vendor", () => {
        const data: Data = {
            opTransactions: [
                transaction("figma", "saas"),
                transaction("figma", "saas"),
                transaction("aws", "cloud"),
                transaction("old", "saas", "2025-07-10"),
            ],
        };

        const byCategory = ledgerFacets(data, "op-transactions", {
            ...selection,
            categories: ["saas"],
        });
        expect(byCategory.vendors).toEqual([
            { value: "figma", label: "figma", count: 2 },
        ]);

        const byVendor = ledgerFacets(data, "op-transactions", {
            ...selection,
            vendors: ["aws"],
        });
        expect(byVendor.categories).toEqual([
            { value: "cloud", label: "Cloud", count: 1 },
        ]);
    });

    it("uses registry labels for providers and flags unknown values", () => {
        const facets = ledgerFacets(
            { opCloud: [cloud("aws", "inference"), cloud("new", "odd")] },
            "op-cloud",
            selection,
        );

        expect(facets.vendors).toEqual([
            { value: "aws", label: "AWS", count: 1 },
            { value: "new", label: "Unmapped · new", count: 1 },
        ]);
        expect(facets.types).toEqual([
            { value: "inference", label: "Inference", count: 1 },
            { value: "odd", label: "Invalid · odd", count: 1 },
        ]);
    });

    it("keeps a selected zero-result value visible until it is cleared", () => {
        const facets = ledgerFacets(
            { opCloud: [cloud("aws", "inference")] },
            "op-cloud",
            { ...selection, vendors: ["google"], types: ["gpu"] },
        );

        expect(facets.vendors).toContainEqual({
            value: "google",
            label: "Google Cloud",
            count: 0,
        });
        expect(facets.types).toContainEqual({
            value: "gpu",
            label: "GPU",
            count: 0,
        });
    });
});
