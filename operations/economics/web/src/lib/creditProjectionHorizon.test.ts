import { expect, it } from "vitest";
import type { VendorLedgerRow } from "../types";
import { providerAccountBalanceRows } from "./providerBalances";

it.each([1000, 1e12])(
    "keeps a distant or overflowing depletion unknown for a $%s balance",
    (amount) => {
        const grant: VendorLedgerRow = {
            entry_id: "grant",
            source: "dashboard",
            vendor: "fireworks",
            account_id: "neoglyph",
            type: "grant",
            start: "2026-09-01 00:00:00",
            end: "",
            paid: 0,
            credit: amount,
            currency: "USD",
            resource_id: "credit",
            resource_name: "Credit",
            resource_sku: "grant",
            resource_count: 1,
            model: "",
            evidence: "Provider grant",
            recorded_at: "2026-10-16",
        };
        const result = providerAccountBalanceRows(
            {
                vendorLedger: [
                    grant,
                    {
                        ...grant,
                        entry_id: "usage",
                        type: "inference",
                        end: "2026-10-01 00:00:00",
                        credit: -0.01,
                        resource_sku: "tokens",
                    },
                    {
                        ...grant,
                        entry_id: "balance",
                        type: "balance",
                        start: "2026-10-16 00:00:00",
                        resource_sku: "current-balance-expiry-assumed",
                    },
                ],
            },
            new Date("2026-10-16T12:00:00Z"),
        );
        expect(
            result.find(
                (row) =>
                    row.vendor === "fireworks" && row.accountId === "neoglyph",
            ),
        ).toMatchObject({
            creditBalanceUsd: amount,
            creditDepletionDate: null,
            creditDepletionReason: null,
        });
    },
);
