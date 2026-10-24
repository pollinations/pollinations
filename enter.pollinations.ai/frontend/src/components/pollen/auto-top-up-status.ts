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
    /** What the problem means for the buyer, when the short text can't say. */
    detail?: string;
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

    // A payment waiting on the bank stays payable whatever the switch says:
    // turning auto top-up off only stops the next purchases.
    if (issue?.kind === "pending_payment") {
        return {
            tab: tab(true),
            text: "Bank approval needed",
            ...(!autoTopUp.enabled && {
                detail: "Auto top-up is off, so it won’t buy again. This payment still needs your bank’s approval.",
            }),
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
    // A card but no name or tax location: auto top-up can't be turned on.
    // The portal opens on its overview, so say where the details are.
    if (
        !autoTopUp.enabled &&
        hasDefaultPaymentMethod(billing) &&
        !billing.billingDetailsComplete
    ) {
        return {
            tab: tab(true),
            text: "Billing details needed",
            detail: "On Stripe, open your initials (top right), then Profile settings, and add your name and billing address.",
            action: { kind: "portal", label: "Add details" },
        };
    }
    return { tab: tab(false), text: null, action: null };
}
