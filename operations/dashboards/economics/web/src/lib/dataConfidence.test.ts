import { expect, it } from "vitest";
import type { OpTransactionRow } from "../types";
import { unreconciledBankAmount } from "./dataConfidence";

const row: OpTransactionRow = {
    entry_id: "payment",
    kind: "transaction",
    source: "wise",
    date: "2026-09-01",
    vendor: "supplier",
    category: "infrastructure",
    amount: -100,
    currency: "USD",
    description: "Payment",
    evidence: "",
    recorded_at: "2026-10-01",
};

it("counts unreconciled receipts and payments without netting or changing ledger amounts", () => {
    const rows: OpTransactionRow[] = [
        row,
        { ...row, entry_id: "receipt", amount: 25 },
        { ...row, entry_id: "small", amount: -0.19 },
        { ...row, entry_id: "opening", kind: "opening_balance", amount: 10000 },
        { ...row, entry_id: "old", date: "2025-09-01" },
        {
            ...row,
            entry_id: "verified",
            evidence:
                "evidence_type=supplier_document https://drive.google.com/file/d/invoice/view",
        },
    ];
    const before = structuredClone(rows);
    expect(unreconciledBankAmount(rows, "2026")).toBeCloseTo(125.19);
    expect(rows).toEqual(before);
});

it("uses the existing monthly currency conversion", () => {
    expect(
        unreconciledBankAmount([{ ...row, currency: "EUR" }], "2026"),
    ).toBeCloseTo(115.13);
});

it("does not infer zero from missing records, invalid amounts or duplicate movements", () => {
    expect(unreconciledBankAmount(undefined, "2026")).toBeNull();
    expect(unreconciledBankAmount([], "2026")).toBeNull();
    expect(unreconciledBankAmount([row], "2025")).toBeNull();
    expect(unreconciledBankAmount([row, row], "2026")).toBeNull();
    expect(
        unreconciledBankAmount([{ ...row, amount: NaN }], "2026"),
    ).toBeNull();
    expect(
        unreconciledBankAmount([{ ...row, currency: "XYZ" }], "2026"),
    ).toBeNull();
});

it("shows zero only when the recorded movements have reconciled evidence", () => {
    expect(
        unreconciledBankAmount(
            [
                {
                    ...row,
                    evidence:
                        "evidence_type=supplier_document https://drive.google.com/file/d/invoice/view",
                },
            ],
            "2026",
        ),
    ).toBe(0);
    expect(
        unreconciledBankAmount(
            [
                {
                    ...row,
                    evidence: "https://drive.google.com/file/d/invoice/view",
                },
            ],
            "2026",
        ),
    ).toBe(100);
});
