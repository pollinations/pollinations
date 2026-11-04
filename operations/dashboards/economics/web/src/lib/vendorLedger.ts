import type { Data, VendorLedgerRow } from "../types";
import { fmtExactNumber as fmtNumber } from "./format";
import { toUsd } from "./fx";

export function vendorLedgerMonth(row: Pick<VendorLedgerRow, "start">): string {
    return row.start.slice(0, 7);
}

export function isVendorLedgerBalanceRow(
    row: Pick<VendorLedgerRow, "type">,
): boolean {
    return row.type.trim().toLowerCase() === "balance";
}

// Signed burn: a refund (positive `paid`) reduces the vendor bill instead of
// being dropped. Every lens must share these helpers so refund months agree.
export function vendorLedgerPaidBurnUsd(
    row: Pick<VendorLedgerRow, "currency" | "paid" | "start" | "type">,
): number {
    if (isVendorLedgerBalanceRow(row)) return 0;
    return -toUsd(row.paid, row.currency, row.start);
}

export function vendorLedgerCreditBurnUsd(
    row: Pick<VendorLedgerRow, "credit" | "currency" | "start" | "type">,
): number {
    if (isVendorLedgerBalanceRow(row)) return 0;
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}

// Compare source facts without posting invoice totals a second time. Explicit IDs
// preserve invoice periods and account scope; missing links never mean zero.
export function vendorSourceDifferences(data: Data) {
    const rows = [
        ...(data.vendorLedger ?? []),
        ...(data.vendorStatements ?? []),
    ];
    const byId = new Map(rows.map((row) => [row.entry_id, row]));
    return rows
        .filter((row) => row.compared_entry_ids?.length)
        .flatMap((row) => {
            const ids = row.compared_entry_ids ?? [];
            const linked = ids.map((id) => byId.get(id));
            const balance = row.comparison_basis === "balance";
            const recorded =
                row.type === "statement"
                    ? row.statement_amount
                    : row.paid + row.credit;
            const incomplete =
                new Set(ids).size !== ids.length ||
                linked.some(
                    (item) =>
                        !item ||
                        item.entry_id === row.entry_id ||
                        item.currency !== row.currency ||
                        item.vendor !== row.vendor ||
                        (item.type === "statement" &&
                            item.statement_amount == null),
                );
            const compared = incomplete
                ? null
                : linked.reduce((sum, item) => {
                      if (!item) return sum;
                      return (
                          sum +
                          (item.type === "statement"
                              ? (item.statement_amount ?? 0)
                              : (balance ? 1 : -1) * (item.paid + item.credit))
                      );
                  }, 0);
            const difference =
                recorded == null || compared == null
                    ? null
                    : recorded - compared;
            // Ignore floating-point summation noise, not monetary discrepancies.
            if (difference != null && Math.abs(difference) < 1e-9) return [];
            const month = row.comparison_month || row.start.slice(0, 7);
            return [
                {
                    month,
                    provider: row.vendor,
                    amountUsd:
                        difference == null
                            ? null
                            : Math.abs(toUsd(difference, row.currency, month)),
                    amountLabel:
                        difference == null
                            ? "Impact unknown"
                            : balance
                              ? "Funding difference"
                              : "Source difference · not included in costs",
                    explanation:
                        compared == null || recorded == null
                            ? `${row.resource_name}: linked source records are missing or incompatible. Difference unknown.`
                            : `${row.resource_name}: ${fmtNumber(recorded)} ${row.currency} recorded; linked records total ${fmtNumber(compared)} ${row.currency}. ${balance ? `Balance snapshot ${row.start.slice(0, 10)} compared with linked funding and usage history; verify intervening coverage.` : `Source period ${row.start.slice(0, 10)} → ${row.end.slice(0, 10) || row.start.slice(0, 10)}. This difference is not an additional booked cost.`}`,
                    evidence: [
                        ...new Set(
                            [row, ...linked].flatMap(
                                (item) =>
                                    item?.evidence.match(
                                        /https?:\/\/[^\s;]+/g,
                                    ) ?? [],
                            ),
                        ),
                    ],
                },
            ];
        });
}
