import { loginErrors } from "@shared/auth/login-errors.ts";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import type { FlowEdge, FlowNode } from "./pollen-connect-diagram";
import { walletBillingVariants } from "./pollen-connect-wallet-preview";

// One inventory for Screens, Map and Journey. Pollinations entries render the
// actual routes; only the developer app and external providers are fixtures.
export const accountActionScreens: CanvasScreen[] = [
    {
        id: "account-app",
        title: "App allowance",
        owner: "Developer app",
        maintained: true,
        screen: "add-pollen-play",
        variants: [
            {
                label: "Available",
                params: { account_action: "1", app_menu: "open" },
            },
            {
                label: "Limit reached",
                params: {
                    account_action: "1",
                    app_menu: "open",
                    sim_budget: "0",
                },
            },
        ],
    },
    {
        id: "account-key",
        title: "App access",
        owner: "Pollinations",
        screen: "account-key",
        variants: [
            { label: "Edit key" },
            { label: "Sign in", screen: "account-key-signed-out" },
            {
                label: "Starting sign-in failed",
                screen: "account-key-signed-out",
                params: { account_case: "sign-in-error", action: "sign-in" },
            },
            { label: "Loading", params: { account_case: "loading" } },
            { label: "Load failed", params: { account_case: "load-error" } },
            { label: "Key unavailable", params: { account_case: "missing" } },
            {
                label: "Saving",
                params: { account_case: "saving", action: "save" },
            },
            {
                label: "Save failed",
                params: { account_case: "save-error", action: "save" },
            },
            { label: "Saved", params: { action: "save" } },
            {
                label: "Closed without changes",
                params: { action: "close-key" },
            },
        ],
    },
    {
        id: "account-wallet",
        title: "Wallet",
        owner: "Pollinations",
        screen: "account-wallet",
        variants: [
            { label: "Paid available" },
            { label: "Quest only", params: { sim_paid: "0" } },
            { label: "Empty", params: { sim_paid: "0", sim_quest: "0" } },
            { label: "Sign in", screen: "account-wallet-signed-out" },
            {
                label: "Starting sign-in failed",
                screen: "account-wallet-signed-out",
                params: { account_case: "sign-in-error", action: "sign-in" },
            },
            { label: "Loading", params: { account_case: "loading" } },
            { label: "Load failed", params: { account_case: "load-error" } },
            {
                label: "Checkout canceled",
                params: { account_case: "canceled" },
            },
            { label: "Payment pending", params: { account_case: "pending" } },
            {
                label: "Payment check failed",
                params: { account_case: "payment-error" },
            },
            { label: "Payment credited", params: { account_case: "credited" } },
            ...walletBillingVariants,
        ],
    },
    {
        id: "account-github",
        title: "Continue on GitHub",
        owner: "GitHub",
        screen: "account-github",
        variants: [{ label: "Handoff" }],
    },
    {
        id: "account-auth-error",
        title: "Pollinations sign-in error",
        owner: "Pollinations",
        screen: "login-failed",
        variants: Object.values(loginErrors).map((error) => ({
            label: error.title,
            screen: error.id,
            params: { login_error: error.code, account_action: "1" },
        })),
    },
    {
        id: "account-payment",
        title: "Checkout",
        owner: "Stripe",
        screen: "account-payment",
        variants: [{ label: "Handoff" }],
    },
    {
        id: "account-billing",
        title: "Manage billing",
        owner: "Stripe",
        screen: "account-billing",
    },
];
export const accountActionNodes: FlowNode[] = accountActionScreens.map(
    (screen, index) => ({
        id: screen.id,
        screen: screen.id,
        x: 180 + (index % 3) * 620,
        y: 150 + Math.floor(index / 3) * 850,
    }),
);
export const accountActionEdges: FlowEdge[] = [
    {
        from: "account-github",
        to: "account-auth-error",
        label: "Sign-in failed or account restricted",
    },
    {
        from: "account-auth-error",
        to: "account-key",
        label: "Sign-in failure · retry requested app access",
    },
    {
        from: "account-auth-error",
        to: "account-wallet",
        label: "Sign-in failure · retry requested wallet",
    },

    {
        from: "account-auth-error",
        to: "account-app",
        label: "Account restricted · close tab",
    },
    { from: "account-app", to: "account-key", label: "App access" },
    { from: "account-app", to: "account-wallet", label: "Wallet" },
    {
        from: "account-key",
        to: "account-wallet",
        label: "Wallet · separate tab",
    },
    {
        from: "account-key",
        to: "account-app",
        label: "Save or cancel, then return",
    },
    { from: "account-key", to: "account-github", label: "Sign in if needed" },
    {
        from: "account-wallet",
        to: "account-github",
        label: "Sign in if needed",
    },
    {
        from: "account-github",
        to: "account-key",
        label: "Resume requested key editor",
    },
    {
        from: "account-github",
        to: "account-wallet",
        label: "Resume requested wallet",
    },
    { from: "account-wallet", to: "account-payment", label: "Buy pack" },
    { from: "account-wallet", to: "account-billing", label: "Manage billing" },
    {
        from: "account-billing",
        to: "account-wallet",
        label: "Return to wallet",
    },
    {
        from: "account-payment",
        to: "account-wallet",
        label: "Cancel or check server credit",
    },
    {
        from: "account-wallet",
        to: "account-app",
        label: "Return · allowance unchanged",
    },
];
