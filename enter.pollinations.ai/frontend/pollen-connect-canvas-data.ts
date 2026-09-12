import { loginErrors } from "@shared/auth/login-errors.ts";
import { adminScreens } from "./pollen-connect-admin";
import { dashboardScreens } from "./pollen-connect-dashboard";
import { defaultPreviewRequest } from "./pollen-connect-request-config";

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
    variants?: ScreenVariant[];
};
export const enterLoginErrorScreens: CanvasScreen[] = Object.entries(
    loginErrors,
).map(([, error]) => ({
    id: error.id,
    title: error.title,
    owner: "Pollinations",
    screen: error.id,
    variants: [
        {
            label: error.title,
            params: {
                login_error: error.code,
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
        ["Unsupported redirect scheme", "redirect-scheme"],
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

export function appVariantSupportsProtocol(
    variant: ScreenVariant,
    protocol?: string,
) {
    return (
        protocol !== "direct" ||
        (![
            "missing-client",
            "missing-challenge",
            "challenge-method",
            "invalid-challenge",
        ].includes(variant.params?.request_error ?? "") &&
            variant.params?.authorize_error !== "code")
    );
}

export function screenVariantIndices(entry: CanvasScreen, protocol?: string) {
    return entry.variants?.length
        ? entry.variants.flatMap((variant, index) =>
              appVariantSupportsProtocol(variant, protocol) ? [index] : [],
          )
        : [0];
}

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
    { label: "Limit reached", params: { sim_budget: "0" } },
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
            },
            {
                id: "sign-in",
                title: "Sign in to Pollinations",
                owner: "Pollinations",
                screen: "oauth-signed-out",
                variants: [
                    { label: "Ready" },
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
                variants: appReturnVariants,
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
        screens: adminScreens,
    },
    {
        title: "Enter account",
        screens: dashboardScreens,
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
        ...defaultPreviewRequest,
        ...variant?.params,
        ...overrides,
    });
    const previewScreen = params.get("screen");
    if (
        params.get("protocol") === "direct" &&
        previewScreen?.startsWith("oauth")
    )
        params.set("screen", previewScreen.replace(/^oauth/, "direct"));
    return `/pollen-connect-screen.html?${params}`;
}
