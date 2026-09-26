import type { CanvasScreen } from "./flow-canvas-data";
import type { FlowEdge, FlowNode } from "./flow-diagram";
import { adminSignInSituations, loginSituations } from "./review-auth";

// One family per real page/component. Pending and recovery stay on that page.
export const adminScreens: CanvasScreen[] = [
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
                },
            },
            {
                label: "Session check failed",
                params: {
                    admin_case: "session-error",
                },
            },
            ...Object.entries(adminSignInSituations).map(([code, error]) => ({
                label: error.label,
                params: {
                    auth_error: code,
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
                },
            },
            {
                label: "Starting sign-in failed",
                params: {
                    action: "sign-in",
                    result: "error",
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
        variants: Object.entries(loginSituations).map(([, error]) => ({
            label: error.title,
            screen: error.id,
            params: {
                login_error: error.code,
                login_flow: "admin",
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
                },
            },
        ],
    },
];
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
    ...[loginSituations.banned, loginSituations.staging].map(
        (error, index): FlowNode => ({
            id: `${error.id}-exit`,
            kind: "outcome",
            label: error.action.label,
            note: error.action.href.replace("mailto:", ""),
            x: 1570,
            y: 850 + index * 190,
        }),
    ),
];
export const adminEdges: FlowEdge[] = [
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
        label: "Admin required · cancelled · expired link · unavailable",
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
    ...[loginSituations.banned, loginSituations.staging].map(
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
];
