import { describe, expect, it } from "vitest";
import { PLANNING_DOCUMENT_FIXTURE } from "../fixtures";
import type { VendorLedgerRow } from "../types";
import {
    ledgerForecastRules,
    parsePlanningDocument,
    validateVendorPlan,
} from "./planning";
import { buildRunway } from "./runway";

const plan: VendorLedgerRow = {
    entry_id: "reserve-return",
    source: "reviewed-plan",
    vendor: "deel",
    type: "planned",
    start: "2026-12",
    end: "2026-12",
    paid: 0,
    credit: 0,
    currency: "EUR",
    resource_id: "",
    resource_name: "Reserve return",
    resource_sku: "",
    resource_count: 0,
    model: "",
    evidence: "",
    recorded_at: "2026-10-16 00:00:00.000",
    plan_amount: 123.45,
    plan_category: "balance_sheet",
    plan_cadence: "once",
    settled_by_entry_ids: [],
};

describe("ledger financial plans and Drive decisions", () => {
    it("preserves forecast calculations when amounts move out of the document", () => {
        const config = parsePlanningDocument(PLANNING_DOCUMENT_FIXTURE);
        const rules = ledgerForecastRules([plan], config);
        const oldRules = {
            "stripe refunds|revenue": {
                fixedAmounts: [{ amount: 0, currency: "USD" as const }],
            },
            "deel|balance_sheet": {
                scheduledAmounts: [
                    {
                        month: "2026-12",
                        amount: 123.45,
                        currency: "EUR" as const,
                        note: "Reserve return",
                    },
                ],
            },
        };
        const now = new Date("2026-10-16T12:00:00Z");
        expect(buildRunway([], now, [], rules)).toEqual(
            buildRunway([], now, [], oldRules),
        );
        expect(config.forecastRules).toEqual({});
        expect(() => ledgerForecastRules([plan, plan], config)).toThrow(
            "Duplicate Vendor plan",
        );
    });
    it("cannot treat a plan as an actual payment or accept invalid periods", () => {
        expect(() => validateVendorPlan({ ...plan, paid: -123.45 })).toThrow(
            "Invalid Vendor plan",
        );
        expect(() => validateVendorPlan({ ...plan, start: "2026-13" })).toThrow(
            "Invalid Vendor plan",
        );
        expect(() =>
            validateVendorPlan({
                ...plan,
                settled_by_entry_ids: ["bank", "bank"],
            }),
        ).toThrow("Invalid Vendor plan");
    });
    it("rejects duplicate money in Drive and does not accept a limitation from prose alone", () => {
        expect(() =>
            parsePlanningDocument({
                ...PLANNING_DOCUMENT_FIXTURE,
                forecastRules: {
                    "deel|payroll": {
                        fixedAmounts: [{ amount: -100, currency: "EUR" }],
                    },
                },
            }),
        ).toThrow("financial plans belong in Vendor");
        const doc = structuredClone(PLANNING_DOCUMENT_FIXTURE);
        delete doc.reviewNotes.providerCheckExplanations[0].decision;
        expect(() => parsePlanningDocument(doc)).toThrow(
            "explicit known-limitation",
        );
    });
});
