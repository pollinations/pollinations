import type { OpCloudRow } from "../types";
import { toUsd } from "./fx";

export function opCloudMonth(row: Pick<OpCloudRow, "start">): string {
    return row.start.slice(0, 7);
}

export function isOpCloudBalanceRow(row: Pick<OpCloudRow, "type">): boolean {
    return row.type.trim().toLowerCase() === "balance";
}

// Signed burn: a refund (positive `paid`) reduces the vendor bill instead of
// being dropped. Every lens must share these helpers so refund months agree.
export function opCloudPaidBurnUsd(
    row: Pick<OpCloudRow, "currency" | "paid" | "start" | "type">,
): number {
    if (isOpCloudBalanceRow(row)) return 0;
    return -toUsd(row.paid, row.currency, row.start);
}

export function opCloudCreditBurnUsd(
    row: Pick<OpCloudRow, "credit" | "currency" | "start" | "type">,
): number {
    if (isOpCloudBalanceRow(row)) return 0;
    return Math.max(0, -toUsd(row.credit, row.currency, row.start));
}
