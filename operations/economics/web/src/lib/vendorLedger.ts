import type { VendorLedgerRow } from "../types";
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
