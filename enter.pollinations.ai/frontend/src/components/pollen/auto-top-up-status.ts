import { formatPollenPackValue } from "@shared/pollen-packs.ts";
import type { BillingOverview } from "../../backend-types.ts";

export type StatusAction =
    | { kind: "link"; label: string; href: string }
    | { kind: "portal"; label: string };

export type AutoTopUpStatus = {
    /** The Auto-refill tab value: the active pack in paid Pollen, or "Off". */
    tab: { on: boolean; label: string; warning: boolean };
    /** A problem to act on, shown next to the tabs; null when all is well. */
    text: string | null;
    action: StatusAction | null;
};

/** Auto-refill charges the default payment method. */
export const hasDefaultPaymentMethod = (billing: BillingOverview) =>
    billing.paymentMethods.some((method) => method.isDefault);

/** What automatic top-up is doing: on the tab label, plus any problem. */
export function autoTopUpStatus(billing: BillingOverview): AutoTopUpStatus {
    const { autoTopUp } = billing;
    const issue = autoTopUp.lastIssue;
    const tab = (warning: boolean) => ({
        on: autoTopUp.enabled,
        label: autoTopUp.enabled
            ? formatPollenPackValue(autoTopUp.packAmountUsd)
            : "Off",
        warning,
    });

    if (autoTopUp.enabled && issue?.kind === "pending_payment") {
        return {
            tab: tab(true),
            text: "Your bank asked to approve a top-up",
            action: {
                kind: "link",
                label: "Complete payment",
                href: issue.invoiceUrl,
            },
        };
    }
    // A decline turns automatic top-up off; turning it back on clears it.
    if (issue?.kind === "failed" && !autoTopUp.enabled) {
        const detail = issue.declineCode && DECLINE_DETAIL[issue.declineCode];
        return {
            tab: tab(true),
            text: `Card declined ${formatDay(issue.occurredAt)}${detail ? `: ${detail}` : ""}`,
            action: { kind: "portal", label: "Update card" },
        };
    }
    return { tab: tab(false), text: null, action: null };
}

// Declines the buyer can fix. The rest, lost or stolen cards among them
// (Stripe asks sellers not to say so), read "Card declined".
const DECLINE_DETAIL: Record<string, string> = {
    insufficient_funds: "insufficient funds",
    expired_card: "card expired",
};

function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
    });
}
