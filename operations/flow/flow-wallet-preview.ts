import type { ScreenVariant } from "./flow-canvas-data";

export const walletReadVariants: ScreenVariant[] = [
    { label: "Balance loading", params: { account_case: "loading" } },
    { label: "Balance unavailable", params: { account_case: "load-error" } },
    {
        label: "Balance session expired",
        params: { account_case: "session-expired" },
    },
    { label: "Billing loading", params: { account_case: "billing-loading" } },
    { label: "Billing unavailable", params: { account_case: "billing-error" } },
    { label: "Checkout canceled", params: { account_case: "canceled" } },
    { label: "Checkout returned", params: { account_case: "checkout-return" } },
];

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
