import { formatPollenPackValue } from "@shared/pollen-packs.ts";
import type { BillingOverview } from "../../backend-types.ts";

type StatusAction =
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
            text: "Bank approval needed",
            action: {
                kind: "link",
                label: "Approve",
                href: issue.invoiceUrl,
            },
        };
    }
    // A decline turns automatic top-up off; turning it back on clears it.
    if (issue?.kind === "failed" && !autoTopUp.enabled) {
        return {
            tab: tab(true),
            text: "Card declined",
            action: { kind: "portal", label: "Update card" },
        };
    }
    return { tab: tab(false), text: null, action: null };
}
