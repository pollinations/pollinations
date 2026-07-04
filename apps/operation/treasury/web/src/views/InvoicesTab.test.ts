import { describe, expect, it } from "vitest";
import type { InvoiceRow } from "../types";
import {
    buildInvoiceManualChange,
    initialInvoiceValues,
    validateInvoiceEdit,
} from "./InvoicesTab";

const row: InvoiceRow = {
    sha256: "abc123",
    provider: "lambda",
    category: "compute",
    period_month: "2026-06",
    amount: 0,
    currency: "USD",
    credit_usd: 384.47,
    invoice_number: "INV-1",
    issued_at: "2026-07-01",
    source: "ai",
    file_ref: "2026-06/lambda.pdf",
    ingested_at: "2026-07-03 06:31:00",
};

describe("validateInvoiceEdit", () => {
    it("accepts valid invoice edit values", () => {
        expect(validateInvoiceEdit(initialInvoiceValues(row))).toBeNull();
    });

    it("rejects invalid category", () => {
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                category: "hosting",
            }),
        ).toBe("category is not valid");
    });
});

describe("buildInvoiceManualChange", () => {
    it("builds a correction row while preserving extracted facts", () => {
        expect(
            buildInvoiceManualChange({
                ingestedAt: "2026-07-03 12:00:00",
                row,
                values: {
                    ...initialInvoiceValues(row),
                    category: "infra",
                },
            }),
        ).toEqual({
            datasource: "invoices",
            key: "invoices:abc123",
            row: {
                sha256: "abc123",
                provider: "lambda",
                category: "infra",
                period_month: "2026-06",
                amount: 0,
                currency: "USD",
                invoice_number: "INV-1",
                issued_at: "2026-07-01",
                source: "manual",
                file_ref: "2026-06/lambda.pdf",
                ingested_at: "2026-07-03 12:00:00",
                credit_usd: 384.47,
            },
            summary: "invoice lambda 2026-06 category -> infra",
        });
    });

    it("sanitizes partial parsed rows before appending to Tinybird", () => {
        expect(
            buildInvoiceManualChange({
                ingestedAt: "2026-07-03 12:00:00",
                row: {
                    ...row,
                    amount: Number.NaN,
                    credit_usd: Number.NaN,
                    currency: "",
                    invoice_number: "",
                    issued_at: "",
                    file_ref: "",
                },
                values: initialInvoiceValues(row),
            }).row,
        ).toMatchObject({
            provider: "lambda",
            amount: 0,
            credit_usd: 0,
            currency: "USD",
            invoice_number: "",
            issued_at: "2026-06-01",
            file_ref: "",
        });
    });
});
