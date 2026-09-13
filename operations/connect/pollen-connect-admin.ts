import { loginErrors } from "@shared/auth/login-errors.ts";
import { dashboardSignInErrors } from "../../packages/ui/src/modules/auth/dashboard-sign-in-errors.ts";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import type { FlowEdge, FlowNode } from "./pollen-connect-diagram";

// One family per real page/component. Pending and recovery stay on that page.
const screens: CanvasScreen[] = [
    {
        id: "dashboard-sign-in",
        title: "Admin sign-in",
        owner: "Developer app",
        maintained: true,
        screen: "dashboard-sign-in",
        variants: [
            { label: "Signed out", params: { signed_out: "1" } },
            {
                label: "Checking sign-in",
                params: {
                    admin_case: "checking",
                    admin_fault: "session-loading",
                },
            },
            {
                label: "Session check failed",
                params: {
                    admin_case: "session-error",
                    admin_fault: "session-error",
                },
            },
            ...Object.entries(dashboardSignInErrors).map(([code, error]) => ({
                label: error.label,
                params: {
                    auth_error: code,
                    admin_user: code === "admin_required" ? "member" : "admin",
                    admin_fault:
                        code === "invalid_state"
                            ? "callback-expired"
                            : code === "unavailable"
                              ? "provider-unavailable"
                              : "none",
                },
            })),
        ],
    },
    {
        id: "identity",
        title: "Sign in to Pollinations",
        owner: "Pollinations",
        screen: "identity",
        variants: [
            { label: "Ready" },
            {
                label: "Signing in",
                params: {
                    action: "sign-in",
                    result: "waiting",
                    admin_fault: "sign-in-loading",
                },
            },
            {
                label: "Starting sign-in failed",
                params: {
                    action: "sign-in",
                    result: "error",
                    admin_fault: "sign-in-error",
                },
            },
        ],
    },
    {
        id: "admin-github",
        title: "Continue on GitHub",
        owner: "GitHub",
        screen: "admin-github",
    },
    {
        id: "admin-auth-error",
        title: "Pollinations sign-in error",
        owner: "Pollinations",
        screen: "login-failed",
        variants: Object.entries(loginErrors).map(([kind, error]) => ({
            label: error.title,
            screen: error.id,
            params: {
                login_error: error.code,
                login_flow: "admin",
                admin_user:
                    kind === "banned"
                        ? "suspended"
                        : kind === "staging"
                          ? "staging"
                          : "admin",
                admin_fault: kind === "default" ? "provider-error" : "none",
            },
        })),
    },
    {
        id: "dashboard-connected",
        title: "Admin account",
        owner: "Developer app",
        maintained: true,
        screen: "dashboard-connected",
        variants: [
            { label: "Signed in", params: { drawer: "closed" } },
            { label: "Account menu", params: { drawer: "open" } },
            {
                label: "Sign-out failed",
                params: {
                    action: "sign-out",
                    signout: "error",
                    admin_fault: "sign-out-error",
                },
            },
        ],
    },
];
export const adminScreens: CanvasScreen[] = screens.map((screen) => ({
    ...screen,
    variants: (screen.variants ?? [{ label: "Continue on GitHub" }]).map(
        (variant) => ({
            ...variant,
            params: {
                admin_user: "admin",
                admin_fault: "none",
                ...variant.params,
                admin_preview: "1",
            },
        }),
    ),
}));

export const adminNodes: FlowNode[] = [
    { id: "dashboard-sign-in", screen: "dashboard-sign-in", x: 100, y: 100 },
    {
        id: "admin-session",
        kind: "decision",
        label: "Pollinations session?",
        x: 460,
        y: 260,
    },
    { id: "identity", screen: "identity", x: 750, y: 100 },
    { id: "admin-github", screen: "admin-github", x: 1170, y: 100 },
    {
        id: "admin-callback",
        kind: "decision",
        label: "Admin access verified?",
        x: 1570,
        y: 260,
    },
    {
        id: "dashboard-connected",
        screen: "dashboard-connected",
        x: 1870,
        y: 100,
    },
    { id: "admin-auth-error", screen: "admin-auth-error", x: 1170, y: 820 },
    ...[loginErrors.banned, loginErrors.staging].map(
        (error, index): FlowNode => ({
            id: `${error.id}-exit`,
            kind: "outcome",
            label: error.action.label,
            note: error.action.href.replace("mailto:", ""),
            x: 1570,
            y: 850 + index * 190,
        }),
    ),
    {
        id: "admin-account",
        kind: "outcome",
        label: "Open dashboard",
        note: "Your Pollinations account wallet",
        x: 2290,
        y: 260,
    },
];
export const adminEdges: FlowEdge[] = [
    {
        from: "dashboard-sign-in",
        to: "admin-account",
        label: "Open account · access denied",
        alternate: true,
        fromSide: "top",
        toSide: "top",
        via: [
            [210, -140],
            [2400, -140],
        ],
        labelAt: [1330, -140],
    },
    {
        from: "dashboard-sign-in",
        to: "admin-session",
        label: "Sign in with Pollinations",
    },
    { from: "admin-session", to: "identity", label: "Sign-in needed" },
    {
        from: "admin-session",
        to: "admin-callback",
        label: "Already signed in",
        fromSide: "top",
        toSide: "top",
        via: [
            [545, 20],
            [1655, 20],
        ],
        labelAt: [1090, 20],
        alternate: true,
    },
    { from: "identity", to: "admin-github", label: "Sign in with GitHub" },
    {
        from: "admin-github",
        to: "admin-callback",
        label: "Return to dashboard",
    },
    {
        from: "admin-callback",
        to: "dashboard-connected",
        label: "Admin verified",
    },
    {
        from: "admin-callback",
        to: "dashboard-sign-in",
        label: "Admin required · expired link · unavailable",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [1655, 700],
            [210, 700],
        ],
        labelAt: [650, 700],
        alternate: true,
    },
    {
        from: "admin-github",
        to: "admin-auth-error",
        label: "Pollinations sign-in failed",
        fromSide: "bottom",
        toSide: "top",
        alternate: true,
    },
    {
        from: "admin-auth-error",
        to: "identity",
        label: "Try again",
        fromSide: "left",
        toSide: "bottom",
        alternate: true,
    },
    ...[loginErrors.banned, loginErrors.staging].map(
        (error): FlowEdge => ({
            from: "admin-auth-error",
            to: `${error.id}-exit`,
            label: error.action.label,
            alternate: true,
        }),
    ),
    {
        from: "dashboard-connected",
        to: "dashboard-sign-in",
        label: "Sign out",
        fromSide: "top",
        toSide: "top",
        via: [
            [1980, -55],
            [210, -55],
        ],
        labelAt: [730, -55],
        alternate: true,
    },
    {
        from: "dashboard-connected",
        to: "admin-account",
        label: "Profile picture",
    },
];
