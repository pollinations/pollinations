import { describe, expect, it } from "vitest";
import { buildPaymentRuleChange } from "./PaymentsTab";

describe("buildPaymentRuleChange", () => {
    it("builds a category override for a payment counterparty", () => {
        expect(
            buildPaymentRuleChange({
                category: "office",
                counterparty: "OFFICE STORE",
                enteredAt: "2026-07-04 12:00:00",
            }),
        ).toEqual({
            datasource: "overrides",
            key: "payments:OFFICE STORE",
            row: {
                entered_at: "2026-07-04 12:00:00",
                scope: "payments",
                key: "OFFICE STORE",
                field: "category",
                value_num: null,
                value_str: "office",
                note: "",
            },
            summary: "payments OFFICE STORE category -> office",
        });
    });
});
