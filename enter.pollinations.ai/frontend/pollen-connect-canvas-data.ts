import { loginErrors } from "@shared/auth/login-errors.ts";

export type ScreenVariant = {
    label: string;
    error?: boolean;
    screen?: string;
    params?: Record<string, string>;
};
export type CanvasScreen = {
    id: string;
    title: string;
    owner: "Pollinations" | "Developer app" | "GitHub" | "Stripe";
    // Shared Pollinations UI may be hosted inside a developer app.
    maintained?: boolean;
    screen?: string;
    illustration?: string;
    previewKind?: "simulation" | "illustration";
    variants?: ScreenVariant[];
};
export const enterLoginErrorScreens: CanvasScreen[] = Object.entries(
    loginErrors,
).map(([code, error]) => ({
    id: error.id,
    title: error.title,
    owner: "Pollinations",
    screen: error.id,
    variants: [
        {
            label: error.title,
            params: {
                login_error:
                    code === "banned"
                        ? "BANNED_USER"
                        : code === "default"
                          ? "unknown"
                          : code,
            },
        },
    ],
}));

export const authorizeRequestErrors: ScreenVariant[] = [
    {
        label: "Unregistered redirect",
        error: true,
        params: { request_error: "redirect" },
    },
    {
        label: "App unavailable",
        error: true,
        params: { request_error: "app" },
    },
    ...[
        ["App verification failed", "lookup"],
        ["Missing redirect", "missing-redirect"],
        ["Invalid redirect", "invalid-redirect"],
        ["Unsupported response", "response-type"],
        ["Missing client", "missing-client"],
        ["Missing security challenge", "missing-challenge"],
        ["Unsupported challenge method", "challenge-method"],
        ["Invalid security challenge", "invalid-challenge"],
    ].map(([label, error]) => ({
        label,
        error: true,
        params: { request_error: error },
    })),
];

export const authorizeFailures = [
    { id: "revoked", label: "App key revoked before approval" },
    { id: "session", label: "Session expired before approval" },
    { id: "key", label: "Key creation failed" },
    { id: "code", label: "Authorization code creation failed" },
] as const;

export const modelCatalogStates = [
    { id: "ready", label: "Models available" },
    { id: "loading", label: "Loading models" },
    { id: "error", label: "Models unavailable" },
] as const;

export const appReturnVariants: ScreenVariant[] = [
    { label: "Connected" },
    {
        label: "Checking connection",
        screen: "add-pollen-connect",
        params: { app_callback: "waiting" },
    },
    {
        label: "Connection not completed",
        screen: "add-pollen-connect",
        params: { app_callback: "error" },
    },
    {
        label: "Connection check unavailable",
        screen: "add-pollen-connect",
        params: { app_callback: "check-error" },
    },
    { label: "Loading account", params: { app_account: "loading" } },
    {
        label: "Account details unavailable",
        params: { app_account: "account-error" },
    },
];

export const canvasGroups: { title: string; screens: CanvasScreen[] }[] = [
    {
        title: "Connect an app",
        screens: [
            {
                id: "app-connect",
                title: "App · Connect",
                owner: "Developer app",
                maintained: true,
                screen: "add-pollen-connect",
                previewKind: "simulation",
            },
            {
                id: "sign-in",
                title: "Sign in to Pollinations",
                owner: "Pollinations",
                screen: "oauth-signed-out",
                variants: [
                    { label: "OAuth" },
                    { label: "Checking app", params: { app_loading: "1" } },
                    {
                        label: "Signing in",
                        params: { action: "sign-in", result: "waiting" },
                    },
                    {
                        label: "Sign-in failed",
                        error: true,
                        params: { action: "sign-in", result: "error" },
                    },
                    { label: "Simple BYOP", screen: "direct-signed-out" },
                    { label: "New account", params: { persona: "new" } },
                    { label: "Device", screen: "device-signed-out" },
                    {
                        label: "Checking account",
                        screen: "device-signed-out",
                        params: { session: "loading" },
                    },
                    {
                        label: "Device with app",
                        screen: "device-signed-out",
                        params: { user_code: "ABCD-EFGH" },
                    },
                ],
            },
            {
                id: "connection-link",
                title: "Connection blocked before sign-in",
                owner: "Pollinations",
                screen: "oauth-request-signed-out",
                variants: authorizeRequestErrors,
            },
            {
                id: "loading",
                title: "Check account",
                owner: "Pollinations",
                screen: "oauth-loading",
                variants: [
                    {
                        label: "Default",
                        params: { session: "loading" },
                    },
                ],
            },
            ...enterLoginErrorScreens,
            {
                id: "consent",
                title: "Allow access",
                owner: "Pollinations",
                screen: "oauth",
                variants: [
                    { label: "Ready" },
                    ...authorizeRequestErrors,
                    { label: "Checking app", params: { app_loading: "1" } },
                    ...modelCatalogStates
                        .filter(({ id }) => id !== "ready")
                        .map(({ id, label }) => ({
                            label,
                            params: { model_catalog: id },
                        })),
                    {
                        label: "Connecting",
                        params: { action: "authorize", result: "waiting" },
                    },
                    ...authorizeFailures.map(({ id, label }) => ({
                        label,
                        error: true,
                        params: {
                            action: "authorize",
                            result: "error",
                            authorize_error: id,
                        },
                    })),
                ],
            },
            {
                id: "app-connected",
                title: "App · Connected",
                owner: "Developer app",
                maintained: true,
                screen: "add-pollen-play",
                previewKind: "simulation",
                variants: [
                    { label: "Available app Pollen" },
                    {
                        label: "Account covers increase",
                        params: { topup_case: "covered" },
                    },
                    {
                        label: "Limit reached",
                        params: { topup_case: "limit-reached" },
                    },
                    {
                        label: "After budget increase",
                        params: { topup_case: "after-budget" },
                    },
                    {
                        label: "After confirmed payment",
                        params: { topup_case: "after-payment" },
                    },
                    {
                        label: "Checkout canceled",
                        params: { topup_case: "canceled" },
                    },
                    {
                        label: "Payment pending",
                        params: { topup_case: "pending" },
                    },
                ],
            },
        ],
    },
    {
        title: "In-app Add Pollen",
        screens: [
            {
                id: "add-pollen-amount",
                title: "Budget",
                owner: "Pollinations",
                screen: "add-pollen-amount",
                previewKind: "simulation",
                variants: [
                    { label: "Purchase needed" },
                    {
                        label: "Checking account",
                        params: { topup_case: "loading" },
                    },
                    {
                        label: "Confirming",
                        params: { topup_case: "confirming" },
                    },
                    {
                        label: "Confirmation failed",
                        error: true,
                        params: { topup_case: "confirm-error" },
                    },
                    {
                        label: "Expired request",
                        error: true,
                        params: { topup_case: "expired" },
                    },
                    {
                        label: "Invalid link",
                        error: true,
                        params: { topup_case: "invalid-link" },
                    },
                    {
                        label: "Reconnect required",
                        error: true,
                        params: { topup_case: "reconnect" },
                    },
                    {
                        label: "Account check failed",
                        error: true,
                        params: { topup_case: "account-error" },
                    },
                    {
                        label: "Sign-in failed",
                        error: true,
                        params: { topup_case: "sign-in-error" },
                    },
                    {
                        label: "Balance covers budget",
                        params: { topup_case: "covered" },
                    },
                ],
            },
            {
                id: "add-pollen-checkout",
                title: "Review purchase",
                owner: "Stripe",
                screen: "add-pollen-checkout",
                previewKind: "illustration",
            },
            {
                id: "add-pollen-pending",
                title: "Payment pending in app",
                owner: "Developer app",
                maintained: true,
                screen: "add-pollen-pending",
                previewKind: "simulation",
                variants: [
                    { label: "Waiting for confirmation" },
                    {
                        label: "Checking confirmation",
                        params: { topup_case: "confirming" },
                    },
                    {
                        label: "Status check failed",
                        error: true,
                        params: { topup_case: "status-error" },
                    },
                    {
                        label: "Still pending",
                        params: { topup_case: "pending" },
                    },
                ],
            },
        ],
    },
    {
        title: "Device connection",
        screens: [
            {
                id: "device-start",
                title: "Start on a device",
                owner: "Developer app",
                illustration: "device",
            },
            {
                id: "device-code",
                title: "Enter device code",
                owner: "Pollinations",
                screen: "device",
                variants: [
                    { label: "Enter code" },
                    {
                        label: "Verifying code",
                        params: { user_code: "ABCD-EFGH", verify: "waiting" },
                    },
                    {
                        label: "Expired code",
                        screen: "device-error",
                        error: true,
                    },
                    { label: "Used code", screen: "device-used", error: true },
                    {
                        label: "Invalid code",
                        screen: "device-invalid",
                        error: true,
                    },
                    {
                        label: "Verification failed",
                        error: true,
                        screen: "device-unavailable",
                    },
                ],
            },
            {
                id: "device-result",
                title: "Device approval result",
                owner: "Pollinations",
                screen: "device-result",
                variants: [
                    { label: "Authorized" },
                    { label: "Denied", params: { outcome: "denied" } },
                ],
            },
            {
                id: "device-done",
                title: "Device connected",
                owner: "Developer app",
                illustration: "device-done",
            },
        ],
    },
    {
        title: "Sign-in providers",
        screens: [
            {
                id: "github-handoff",
                title: "Continue on GitHub",
                owner: "GitHub",
                illustration: "github-handoff",
            },
            {
                id: "github-login",
                title: "GitHub sign-in",
                owner: "GitHub",
                illustration: "github-login",
            },
            {
                id: "github-signup",
                title: "GitHub signup · Provider handoff",
                owner: "GitHub",
                illustration: "github-signup",
            },
            {
                id: "github-authorize",
                title: "GitHub authorization",
                owner: "GitHub",
                illustration: "github-authorize",
            },
        ],
    },
    {
        title: "Admin dashboards",
        screens: [
            {
                id: "dashboard-sign-in",
                title: "Admin sign-in recovery",
                owner: "Developer app",
                maintained: true,
                screen: "observability",
                variants: [
                    { label: "Signed out", params: { signed_out: "1" } },
                    ...["invalid_state", "unavailable"].map((code) => ({
                        label:
                            code === "invalid_state"
                                ? "Expired sign-in"
                                : "Sign-in unavailable",
                        screen: "dashboard-error",
                        error: true,
                        params: { auth_error: code },
                    })),
                    {
                        label: "Access denied",
                        error: true,
                        screen: "dashboard-error",
                        params: { auth_error: "admin_required" },
                    },
                ],
            },
            {
                id: "identity",
                title: "Admin identity check",
                owner: "Pollinations",
                screen: "identity",
                variants: [
                    { label: "Sign in" },
                    {
                        label: "Signing in",
                        params: { action: "sign-in", result: "waiting" },
                    },
                    {
                        label: "Sign-in failed",
                        error: true,
                        params: { action: "sign-in", result: "error" },
                    },
                ],
            },
            {
                id: "dashboard-connected",
                title: "Admin account menu",
                owner: "Developer app",
                maintained: true,
                screen: "dashboard-connected",
            },
        ],
    },
    {
        title: "Enter account",
        screens: [
            {
                id: "enter-signed-out",
                title: "Enter sign-in",
                owner: "Pollinations",
                screen: "enter-signed-out",
                variants: [
                    { label: "Sign in" },
                    {
                        label: "Signing in",
                        params: { action: "sign-in", result: "waiting" },
                    },
                    {
                        label: "Sign-in failed",
                        error: true,
                        params: { action: "sign-in", result: "error" },
                    },
                ],
            },
            {
                id: "enter-connected",
                title: "Enter account dashboard",
                owner: "Pollinations",
                screen: "enter-connected",
                variants: [
                    { label: "Account" },
                    {
                        label: "Loading account",
                        params: { session: "loading" },
                    },
                    {
                        label: "Account unavailable",
                        error: true,
                        params: { session: "error" },
                    },
                ],
            },
            {
                id: "account-checkout",
                title: "Buy account Pollen",
                owner: "Stripe",
                screen: "account-checkout",
                previewKind: "illustration",
                variants: [
                    {
                        label: "Buy Pollen",
                        params: { purchase: "account", sim_pack: "5" },
                    },
                ],
            },
            {
                id: "keys",
                title: "API keys",
                owner: "Pollinations",
                screen: "keys",
                variants: [
                    { label: "Signed in" },
                    { label: "Signed out", screen: "account-signed-out" },
                ],
            },
            {
                id: "api-key",
                title: "Create API key",
                owner: "Pollinations",
                screen: "api-key",
                variants: [
                    { label: "Create" },
                    {
                        label: "Creating",
                        params: { action: "create", result: "waiting" },
                    },
                    {
                        label: "Created",
                        params: { action: "create", result: "success" },
                    },
                    {
                        label: "Creation failed",
                        error: true,
                        params: { action: "create", result: "error" },
                    },
                ],
            },
            {
                id: "key-edit",
                title: "Edit key",
                owner: "Pollinations",
                screen: "key-edit",
                variants: [
                    { label: "App connection" },
                    { label: "API key", params: { key_kind: "secret" } },
                    { label: "App registration", params: { key_kind: "app" } },
                    {
                        label: "Saving",
                        params: { action: "save", result: "waiting" },
                    },
                    {
                        label: "Save failed",
                        error: true,
                        params: { action: "save", result: "error" },
                    },
                ],
            },
            {
                id: "key-delete",
                title: "Delete key",
                owner: "Pollinations",
                screen: "key-delete",
            },
            {
                id: "app-key",
                title: "Register an app",
                owner: "Pollinations",
                screen: "app-key",
                variants: [
                    { label: "Create" },
                    {
                        label: "Creating",
                        params: { action: "create", result: "waiting" },
                    },
                    {
                        label: "Created",
                        params: { action: "create", result: "success" },
                    },
                    {
                        label: "Creation failed",
                        error: true,
                        params: { action: "create", result: "error" },
                    },
                ],
            },
        ],
    },
];

export function canvasScreenUrl(
    entry: CanvasScreen,
    variantIndex = 0,
    overrides: Record<string, string> = {},
) {
    const variant = entry.variants?.[variantIndex];
    const screen = variant?.screen ?? entry.screen;
    const params = new URLSearchParams({
        screen: screen ?? "oauth",
        balance: "positive",
        badge: "none",
        wallet: "total",
        request_scope: "profile usage keys",
        request_models: "all",
        request_budget: "5",
        request_expiry: "7",
        request_earnings: "1",
        request_attribution: "1",
        ...variant?.params,
        ...overrides,
    });
    return `/pollen-connect-screen.html?${params}`;
}
