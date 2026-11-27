import { expect, it } from "vitest";
import type { OpTransactionRow, VendorLedgerRow } from "../types";
import { buildRunway } from "./runway";

it("explains mismatched observation dates without improving the cash forecast", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const review = { baselineMonth: "2026-09", asOf: "2026-10-16" };
    const opening: OpTransactionRow = {
        entry_id: "opening",
        kind: "opening_balance",
        source: "wise",
        date: "2026-01-01",
        vendor: "wise",
        category: "balance_sheet",
        amount: 10000,
        currency: "USD",
        description: "Opening balance",
        evidence: "Wise statement",
        recorded_at: "2026-10-01",
    };
    const bank: OpTransactionRow[] = [
        opening,
        {
            ...opening,
            entry_id: "fee",
            kind: "transaction",
            date: "2026-09-30",
            category: "admin",
            amount: -1,
        },
    ];
    const usage: VendorLedgerRow = {
        entry_id: "usage",
        source: "dashboard",
        vendor: "fireworks",
        account_id: "neoglyph",
        type: "inference",
        start: "2026-09-01 00:00:00",
        end: "2026-10-01 00:00:00",
        paid: 0,
        credit: -310,
        currency: "USD",
        resource_id: "tokens",
        resource_name: "Tokens",
        resource_sku: "tokens",
        resource_count: 1,
        model: "model",
        evidence: "Provider export",
        recorded_at: "2026-10-16",
    };
    const balance = {
        ...usage,
        entry_id: "balance",
        type: "balance",
        start: "2026-10-16 00:00:00",
        end: "",
        credit: 310,
        resource_sku: "current-balance-expiry-assumed",
    };
    const newer = buildRunway(
        bank,
        now,
        [usage, balance],
        undefined,
        [],
        review,
    );
    const older = buildRunway(
        bank,
        now,
        [usage, { ...balance, start: "2026-10-14 00:00:00" }],
        undefined,
        [],
        review,
    );
    expect(newer.forecastTimingNote).toContain("2026-09-30");
    expect(newer.forecastTimingNote).toContain("2026-10-16");
    expect(newer.forecastTimingNote).toContain("not reconciled");
    expect(newer.currentCashUsd).toBe(9999);
    expect(newer.rows.map((row) => row.values["2026-10:forecast"])).toEqual(
        older.rows.map((row) => row.values["2026-10:forecast"]),
    );
    for (const [end, octoberCash] of [
        ["2026-10-20", -110],
        ["2026-10-31", 0],
    ] as const) {
        const expiring = buildRunway(
            bank,
            now,
            [
                {
                    ...usage,
                    evidence:
                        "https://drive.google.com/file/d/monthly-usage/view",
                },
                { ...balance, end },
            ],
            undefined,
            [],
            review,
        );
        const line = expiring.rows.find((row) => row.vendor === "fireworks");
        expect(line?.values["2026-10:forecast"]).toBeCloseTo(octoberCash);
        expect(line?.values["2026-11:forecast"]).toBeCloseTo(-310);
        expect(line?.creditValues?.["2026-11:forecast"] ?? 0).toBe(0);
        expect(expiring.flags.join(" ")).toContain(
            "opening balance for 2026-10-01 is missing",
        );
        expect(expiring.currentCashUsd).toBe(9999);
    }
});
