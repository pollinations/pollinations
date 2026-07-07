import { describe, expect, it } from "vitest";
import type { ProviderMonthlyRow, TransactionRow } from "../types";
import { providerMatchFor } from "./TransactionsTab";

const tx = (over: Partial<TransactionRow>): TransactionRow => ({
    date: "2026-05-11",
    vendor: "aws",
    category: "compute",
    charged_amount: 4044.96,
    charged_currency: "EUR",
    ...over,
});

const provider = (over: Partial<ProviderMonthlyRow>): ProviderMonthlyRow => ({
    month: "2026-04",
    vendor: "aws",
    currency: "EUR",
    credit: 0,
    paid: 4044.96,
    source: "manual",
    ...over,
});

describe("providerMatchFor", () => {
    it("matches an exact same-currency amount in the previous month", () => {
        // aws: Wise charge May 11 settles the April reseller invoice.
        expect(providerMatchFor(tx({}), [provider({})])).toBe("match");
    });

    it("matches an exact same-currency amount in the same month", () => {
        expect(
            providerMatchFor(tx({ date: "2026-04-09" }), [provider({})]),
        ).toBe("match");
    });

    it("misses when no provider row exists nearby", () => {
        expect(providerMatchFor(tx({}), [provider({ month: "2026-01" })])).toBe(
            "miss",
        );
    });

    it("misses on a same-currency amount mismatch", () => {
        expect(providerMatchFor(tx({}), [provider({ paid: 4000.0 })])).toBe(
            "miss",
        );
    });

    it("ignores credit-only provider rows", () => {
        expect(
            providerMatchFor(tx({}), [provider({ paid: 0, credit: 4044.96 })]),
        ).toBe("miss");
    });

    it("matches across currencies via monthly FX within tolerance", () => {
        // EUR 100 charged in May (rate 1.1673) vs USD 116.73 provider paid.
        expect(
            providerMatchFor(tx({ date: "2026-05-02", charged_amount: 100 }), [
                provider({
                    month: "2026-05",
                    currency: "USD",
                    paid: 116.73,
                }),
            ]),
        ).toBe("match");
    });

    it("misses across currencies beyond the 2.5% tolerance", () => {
        expect(
            providerMatchFor(tx({ date: "2026-05-02", charged_amount: 100 }), [
                provider({
                    month: "2026-05",
                    currency: "USD",
                    paid: 226.74,
                }),
            ]),
        ).toBe("miss");
    });

    it("returns null for non-compute rows", () => {
        expect(
            providerMatchFor(tx({ category: "payroll" }), [provider({})]),
        ).toBe(null);
    });
});
