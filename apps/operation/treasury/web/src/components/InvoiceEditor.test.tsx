import { describe, expect, it } from "vitest";
import type { InvoiceRow } from "../types";
import {
    buildInvoiceIgnoreChange,
    buildInvoiceLabelChange,
    initialInvoiceValues,
    validateInvoiceEdit,
} from "./InvoiceEditor";

const row: InvoiceRow = {
    sha256: "abc123",
    provider: "lambda",
    category: "compute",
    kind: "monthly_bill",
    period_month: "2026-06",
    amount: 0,
    currency: "USD",
    amount_usd: 0,
    credit_usd: 384.47,
    invoice_number: "INV-1",
    issued_at: "2026-07-01",
    source: "email",
    file_ref: "2026-06/lambda.pdf",
    status: "parsed",
    ingested_at: "2026-07-03 10:00:00",
};

describe("validateInvoiceEdit", () => {
    it("accepts valid invoice label values", () => {
        expect(validateInvoiceEdit(initialInvoiceValues(row))).toBeNull();
    });

    it("rejects invalid month, amount, and currency", () => {
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                periodMonth: "2026-13",
            }),
        ).toBe("period_month must be YYYY-MM");
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                amount: "-1",
            }),
        ).toBe("amount due must be >= 0");
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                currency: "GBP",
            }),
        ).toBe("currency must be USD or EUR");
    });
});

describe("buildInvoiceLabelChange", () => {
    it("builds a full label row for invoices", () => {
        expect(
            buildInvoiceLabelChange({
                ingestedAt: "2026-07-03 12:00:00",
                row,
                values: {
                    ...initialInvoiceValues(row),
                    amount: "12.5",
                    creditUsd: "1.25",
                    invoiceNumber: "INV-2",
                },
            }),
        ).toEqual({
            datasource: "invoices",
            row: {
                sha256: "abc123",
                provider: "lambda",
                category: "compute",
                kind: "monthly_bill",
                period_month: "2026-06",
                amount: 12.5,
                currency: "USD",
                invoice_number: "INV-2",
                issued_at: "2026-07-01",
                source: "label",
                file_ref: "2026-06/lambda.pdf",
                status: "parsed",
                ingested_at: "2026-07-03 12:00:00",
                credit_usd: 1.25,
            },
            summary: "invoice lambda 2026-06 label",
        });
    });
});

describe("buildInvoiceIgnoreChange", () => {
    it("builds an ignored label row for non-invoices", () => {
        expect(
            buildInvoiceIgnoreChange({
                ingestedAt: "2026-07-03 12:00:00",
                reason: "duplicate receipt",
                row,
            }),
        ).toEqual({
            datasource: "invoices",
            row: {
                sha256: "abc123",
                provider: "lambda",
                category: "compute",
                kind: "not_invoice",
                period_month: "",
                amount: 0,
                currency: "USD",
                invoice_number: "duplicate receipt",
                issued_at: "2026-07-01",
                source: "label",
                file_ref: "2026-06/lambda.pdf",
                status: "ignored",
                ingested_at: "2026-07-03 12:00:00",
                credit_usd: 0,
            },
            summary: "invoice lambda ignored",
        });
    });
});
