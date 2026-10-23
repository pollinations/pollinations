import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { Data, OpTransactionRow, VendorLedgerRow } from "../types";
import { RunwayTab } from "./RunwayTab";

afterEach(() => vi.useRealTimers());

it.each([true, false])(
    "renders recorded credit spend while another provider cost is missing=%s",
    (unknown) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
        const opening: OpTransactionRow = {
            entry_id: "opening",
            kind: "opening_balance",
            source: "wise",
            date: "2026-01-01",
            vendor: "wise",
            category: "balance_sheet",
            amount: 1000,
            currency: "USD",
            description: "Opening",
            evidence: "Wise statement",
            recorded_at: "2026-10-01",
        };
        const usage: VendorLedgerRow = {
            entry_id: "usage",
            source: "invoice",
            vendor: "aws",
            account_id: "myceli",
            type: "inference",
            start: "2026-09-01 00:00:00",
            end: "2026-10-01 00:00:00",
            paid: 0,
            credit: -300,
            currency: "USD",
            resource_id: "model",
            resource_name: "Usage",
            resource_sku: "tokens",
            resource_count: 1,
            model: "model",
            evidence: "https://drive.google.com/file/d/provider-export/view",
            recorded_at: "2026-10-01",
        };
        const data: Data = {
            opTransactions: [
                opening,
                ...(unknown
                    ? [
                          {
                              ...opening,
                              entry_id: "retell-payment",
                              kind: "transaction" as const,
                              date: "2026-09-19",
                              vendor: "retell",
                              category: "compute",
                              amount: -7.44,
                          },
                      ]
                    : []),
            ],
            vendorLedger: [usage],
        };
        const html = renderToStaticMarkup(
            createElement(RunwayTab, { data, year: "2026" }),
        );
        const headers = html.match(/<th\b[^>]*>[\s\S]*?<\/th>/g) ?? [];
        const october = headers.filter((header) => header.includes("October"));
        expect(october).toHaveLength(1);
        expect(october[0]).toContain("Plan");
        expect(october[0]).not.toContain("Provisional");
        expect(html).not.toContain("To date");
        if (unknown)
            expect(
                headers.find((header) => header.includes("September")),
            ).toContain("Provisional");
        const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) ?? [];
        for (const label of ["Expenses", "Compute"]) {
            const row = rows.find((item) =>
                item.includes(`aria-label="${label} calculation info"`),
            );
            const cell = row
                ?.match(/<td\b[^>]*>[\s\S]*?<\/td>/g)
                ?.find((item) => item.includes("−300"));
            const shown = cell?.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
            expect(shown).toBe(unknown ? "*−300" : "−300");
            expect(cell).toContain("text-xs font-normal text-theme-text-muted");
        }
    },
);

it("withholds forecast cards and columns when planning is unavailable", () => {
    const html = renderToStaticMarkup(
        createElement(RunwayTab, {
            data: { planningError: "Drive unavailable" },
            year: "2026",
        }),
    );
    expect(html).not.toContain("Cash runway");
    expect(html).not.toContain(">Plan<");
    expect(html).toContain("Cash balance");
});
