import { describe, expect, it } from "vitest";
import type { OpTransactionRow, VendorLedgerRow } from "../types";
import {
    bankPaymentHasServiceEvidence,
    providerCloseRows,
} from "./providerClose";

const invoice = "https://drive.google.com/file/d/tinybird-original/view";
const usage: VendorLedgerRow = {
    entry_id: "tinybird-august",
    source: "invoice",
    vendor: "tinybird",
    account_id: "myceli",
    type: "infra",
    start: "2026-08-01 00:00:00",
    end: "2026-09-01 00:00:00",
    credit: 0,
    paid: -218.56,
    currency: "USD",
    resource_id: "build",
    resource_name: "Build plan",
    resource_sku: "build",
    resource_count: 1,
    model: "",
    evidence: `${invoice}; calendar_coverage=unverified; invoice period July 18 to August 17`,
    recorded_at: "2026-10-16",
};
const payment: OpTransactionRow = {
    entry_id: "tinybird-payment",
    kind: "transaction",
    source: "wise",
    date: "2026-08-19",
    vendor: "tinybird",
    category: "infrastructure",
    amount: -218.56,
    currency: "USD",
    description: "Tinybird invoice payment",
    evidence: `evidence_type=supplier_document; invoice=${invoice}; payment_match=verified`,
    recorded_at: "2026-10-16",
};

describe("calendar service evidence", () => {
    it("keeps a known billing-cycle difference open after matching its invoice payment", () => {
        expect(bankPaymentHasServiceEvidence(payment, [usage])).toBe(true);
        const close = providerCloseRows(
            {
                vendorLedger: [usage],
                opTransactions: [payment],
                opPollen: [],
            },
            "2026-10",
        ).find((row) => row.vendor === "tinybird" && row.month === "2026-08");
        expect(close?.coverageStatus).toBe("partial");
        expect(close?.closeStatus).not.toBe("ready");
        expect(close?.billedUsd).toBe(218.56);
    });
    it("does not treat the recorded calendar placement as a payment match without invoice identity", () => {
        expect(
            bankPaymentHasServiceEvidence(
                { ...payment, evidence: "Wise statement" },
                [usage],
            ),
        ).toBe(false);
    });
});

describe("retained subscription evidence", () => {
    it("recognizes an invoice-backed subscription without inventing calendar coverage", () => {
        const subscription = {
            ...usage,
            vendor: "retell",
            type: "subscription",
            paid: -7.44,
            start: "2026-07-29 00:00:00",
            end: "2026-08-29 00:00:00",
            evidence: `evidence_type=supplier_document invoice=${invoice}`,
        };
        const paid = {
            ...payment,
            vendor: "retell",
            date: "2026-07-29",
            amount: -7.44,
        };
        expect(bankPaymentHasServiceEvidence(paid, [subscription])).toBe(true);
        const close = providerCloseRows(
            {
                vendorLedger: [subscription],
                opTransactions: [paid],
                opPollen: [],
            },
            "2026-10",
        ).find((row) => row.vendor === "retell" && row.month === "2026-07");
        expect(close?.billedUsd).toBe(7.44);
        expect(close?.coverageStatus).toBe("partial");
        expect(close?.closeStatus).not.toBe("ready");
        expect(
            bankPaymentHasServiceEvidence(paid, [
                { ...subscription, type: "unrecognized" },
            ]),
        ).toBe(false);
    });
});
