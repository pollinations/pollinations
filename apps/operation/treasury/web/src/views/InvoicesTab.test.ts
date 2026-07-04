import { describe, expect, it } from "vitest";
import type { InvoiceRow } from "../types";
import {
    buildInvoiceLabelChange,
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
    file_ref: "2026-06/lambda.pdf",
};

describe("validateInvoiceEdit", () => {
    it("accepts valid invoice label values", () => {
        expect(validateInvoiceEdit(initialInvoiceValues(row))).toBeNull();
    });

    it("rejects invalid provider and category", () => {
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                provider: " ",
            }),
        ).toBe("provider is required");
        expect(
            validateInvoiceEdit({
                ...initialInvoiceValues(row),
                category: "hosting",
            }),
        ).toBe("category is not valid");
    });
});

describe("buildInvoiceLabelChange", () => {
    it("builds a correction row while preserving extracted facts", () => {
        expect(
            buildInvoiceLabelChange({
                ingestedAt: "2026-07-03 12:00:00",
                row,
                values: {
                    ...initialInvoiceValues(row),
                    category: "infra",
                    provider: "lambda-cloud",
                },
            }),
        ).toEqual({
            datasource: "invoices",
            key: "invoices:abc123",
            row: {
                sha256: "abc123",
                provider: "lambda-cloud",
                category: "infra",
                period_month: "2026-06",
                amount: 0,
                currency: "USD",
                invoice_number: "INV-1",
                issued_at: "2026-07-01",
                source: "label",
                file_ref: "2026-06/lambda.pdf",
                status: "parsed",
                ingested_at: "2026-07-03 12:00:00",
                credit_usd: 384.47,
            },
            summary: "invoice lambda-cloud 2026-06 label",
        });
    });

    it("sanitizes partial parsed rows before appending to Tinybird", () => {
        expect(
            buildInvoiceLabelChange({
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
                values: {
                    ...initialInvoiceValues(row),
                    provider: "anthropic",
                },
            }).row,
        ).toMatchObject({
            amount: 0,
            credit_usd: 0,
            currency: "USD",
            invoice_number: "",
            issued_at: "2026-06-01",
            file_ref: "",
        });
    });
});
