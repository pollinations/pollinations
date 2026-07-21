import { PollinationsError } from "./types.js";

export type PaymentRequiredReason = "key_budget" | "account_balance";

export function paymentRequiredReason(
    error: unknown,
): PaymentRequiredReason | null {
    if (!(error instanceof PollinationsError) || error.status !== 402) {
        return null;
    }
    const reason = error.details?.reason;
    return reason === "key_budget" || reason === "account_balance"
        ? reason
        : null;
}
