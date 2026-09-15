import type { ScreenVariant } from "./pollen-connect-canvas-data";

export const walletSessionVariant: ScreenVariant = {
    label: "Session expired",
    params: { account_case: "session-expired" },
};

// Both wallet routes expose the same real billing controls and preview states.
export const walletBillingVariants: ScreenVariant[] = [
    {
        label: "Auto top-up setup",
        params: { billing_case: "setup", action: "billing-setup" },
    },
    {
        label: "Auto top-up ready",
        params: { billing_case: "ready", action: "billing-setup" },
    },
    { label: "Auto top-up enabled", params: { billing_case: "enabled" } },
    {
        label: "Saving auto top-up",
        params: {
            billing_case: "ready",
            action: "billing-save",
            result: "waiting",
        },
    },
    {
        label: "Auto top-up save failed",
        params: {
            billing_case: "ready",
            action: "billing-save",
            result: "error",
        },
    },
    { label: "Last charge failed", params: { billing_case: "failed" } },
    { label: "Payment action required", params: { billing_case: "payment" } },
    {
        label: "Opening billing",
        params: {
            billing_case: "enabled",
            action: "billing-portal",
            result: "waiting",
        },
    },
    {
        label: "Billing handoff failed",
        params: {
            billing_case: "enabled",
            action: "billing-portal",
            result: "error",
        },
    },
    {
        label: "Billing session expired",
        params: {
            billing_case: "ready",
            action: "billing-save",
            result: "session-expired",
        },
    },
];
