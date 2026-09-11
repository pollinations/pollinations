import { loginErrors } from "@shared/auth/login-errors.ts";
import { appLoginEdges, appLoginNodes } from "./pollen-connect-app-login";
import { enterLoginErrorScreens } from "./pollen-connect-canvas-data";

export type FlowNode = {
    id: string;
    x: number;
    y: number;
    screen?: string;
    kind?: "decision" | "outcome";
    label?: string;
    note?: string;
};
type Side = "left" | "right" | "top" | "bottom";
export type FlowEdge = {
    from: string;
    to: string;
    label: string;
    action?: string;
    fromSide?: Side;
    toSide?: Side;
    via?: [number, number][];
    labelAt?: [number, number];
    alternate?: boolean;
};
export const paper = { width: 7500, height: 4950 };
export const flowSections = [
    {
        id: "add-pollen",
        title: "In-app Add Pollen",
        note: "App budget is a spending limit, not a transfer",
        x: 4160,
        y: 70,
        width: 3260,
        height: 2070,
    },

    {
        id: "sign-in",
        title: "Shared sign-in",
        note: "Return to the flow that started sign-in",
        x: 70,
        y: 940,
        width: 3920,
        height: 1330,
    },
    {
        id: "device",
        title: "Device / CLI",
        note: "Browser approval · device waits for the result",
        x: 70,
        y: 2340,
        width: 3920,
        height: 660,
    },
    {
        id: "account",
        title: "Enter account",
        note: "Account balance and API keys",
        x: 70,
        y: 3020,
        width: 3920,
        height: 1260,
    },
    {
        id: "admin",
        title: "Admin dashboards",
        note: "Observability · Economics · KPI",
        x: 70,
        y: 4330,
        width: 3920,
        height: 570,
    },
] as const;
export type FlowId = (typeof flowSections)[number]["id"] | "app";
export function loginRetryNode(flow: string): string {
    return flow === "account"
        ? "enter-signed-out"
        : flow === "admin"
          ? "dashboard-sign-in"
          : "sign-in";
}
export const flowNodes: FlowNode[] = [
    ...[loginErrors.banned, loginErrors.staging].map(
        (error, index): FlowNode => ({
            id: `${error.id}-exit`,
            kind: "outcome",
            label: error.action.label,
            note: error.action.href.replace("mailto:", ""),
            x: 2700 + index * 450,
            y: 2250,
        }),
    ),
    ...enterLoginErrorScreens.map((screen, index) => ({
        id: screen.id,
        screen: screen.id,
        x: 2700 + index * 450,
        y: 1700,
    })),
    { id: "add-pollen-amount", screen: "add-pollen-amount", x: 4210, y: 180 },
    {
        id: "add-pollen-covered",
        kind: "decision",
        label: "Can save without a purchase?",
        x: 5100,
        y: 350,
    },
    {
        id: "add-pollen-checkout",
        screen: "add-pollen-checkout",
        x: 5520,
        y: 860,
    },
    {
        id: "add-pollen-pending",
        screen: "add-pollen-pending",
        x: 6020,
        y: 1450,
    },
    {
        id: "add-pollen-credited",
        kind: "outcome",
        label: "Account balance credited",
        note: "Only after confirmed payment",
        x: 6560,
        y: 1000,
    },
    {
        id: "add-pollen-increased",
        kind: "outcome",
        label: "App budget saved",
        note: "Applied once · same app connection",
        x: 7030,
        y: 350,
    },
    {
        id: "add-pollen-unchanged",
        kind: "outcome",
        label: "Return to app",
        note: "App budget unchanged",
        x: 4680,
        y: 1800,
    },

    {
        id: "add-pollen-failed",
        kind: "outcome",
        label: "Top-up unavailable",
        note: "No increase · return to app and retry",
        x: 5520,
        y: 1820,
    },
    { id: "app-connect", screen: "app-connect", x: 110, y: 180 },
    {
        id: "request-valid",
        kind: "decision",
        label: "Valid request?",
        note: "App + return address",
        x: 2160,
        y: 350,
    },
    { id: "consent", screen: "consent", x: 2540, y: 180 },
    { id: "app-connected", screen: "app-connected", x: 3440, y: 180 },
    {
        id: "blocked",
        kind: "outcome",
        label: "Authorization blocked",
        note: "Fix the app request · no unsafe redirect",
        x: 2135,
        y: 720,
    },
    {
        id: "cancelled",
        kind: "outcome",
        label: "Access declined",
        note: "No connection granted",
        x: 2540,
        y: 760,
    },
    {
        id: "session",
        kind: "decision",
        label: "Signed in to Pollinations?",
        x: 510,
        y: 1180,
    },
    { id: "sign-in", screen: "sign-in", x: 820, y: 1060 },
    {
        id: "github-session",
        kind: "decision",
        label: "Signed in to GitHub?",
        x: 1160,
        y: 1180,
    },
    { id: "github-login", screen: "github-login", x: 1460, y: 1060 },
    {
        id: "github-approval",
        kind: "decision",
        label: "GitHub approval needed?",
        x: 1900,
        y: 1180,
    },
    { id: "github-authorize", screen: "github-authorize", x: 2240, y: 1060 },
    { id: "loading", screen: "loading", x: 2700, y: 1060 },
    {
        id: "resume",
        kind: "decision",
        label: "Return to…",
        note: "Original destination",
        x: 3080,
        y: 1180,
    },
    { id: "error", kind: "outcome", label: "Sign-in failed", x: 3440, y: 1060 },
    { id: "github-signup", screen: "github-signup", x: 1460, y: 1700 },
    { id: "device-start", screen: "device-start", x: 110, y: 2430 },
    { id: "device-code", screen: "device-code", x: 1190, y: 2430 },
    {
        id: "code-valid",
        kind: "decision",
        label: "Code valid + pending?",
        x: 1750,
        y: 2580,
    },
    {
        id: "device-wait",
        kind: "outcome",
        label: "Waiting for approval",
        note: "Device keeps polling",
        x: 2530,
        y: 2630,
    },
    { id: "device-result", screen: "device-result", x: 2135, y: 2430 },
    { id: "device-done", screen: "device-done", x: 3440, y: 2430 },
    {
        id: "device-stopped",
        kind: "outcome",
        label: "Denied or expired",
        note: "Stop polling · request a new code",
        x: 3010,
        y: 2830,
    },
    { id: "enter-signed-out", screen: "enter-signed-out", x: 950, y: 3110 },
    { id: "enter-connected", screen: "enter-connected", x: 2150, y: 3110 },
    { id: "account-checkout", screen: "account-checkout", x: 2150, y: 3730 },
    { id: "keys", screen: "keys", x: 2700, y: 3110 },
    { id: "key-edit", screen: "key-edit", x: 2700, y: 3730 },
    { id: "key-delete", screen: "key-delete", x: 3190, y: 3730 },
    { id: "api-key", screen: "api-key", x: 3190, y: 3110 },
    { id: "app-key", screen: "app-key", x: 3740, y: 3110 },
    { id: "dashboard-sign-in", screen: "dashboard-sign-in", x: 110, y: 4410 },
    { id: "identity", screen: "identity", x: 820, y: 4410 },
    { id: "admin", kind: "decision", label: "Admin access?", x: 2140, y: 4550 },
    {
        id: "dashboard-connected",
        screen: "dashboard-connected",
        x: 2700,
        y: 4410,
    },
    {
        id: "dashboard-denied",
        kind: "outcome",
        label: "Access denied",
        note: "Admin account required",
        x: 2140,
        y: 4770,
    },
];
export const flowEdges: FlowEdge[] = [
    ...enterLoginErrorScreens.flatMap((screen): FlowEdge[] => [
        {
            from: "loading",
            to: screen.id,
            label: screen.title,
            alternate: true,
            fromSide: "bottom",
            toSide: "top",
        },
        {
            from: screen.id,
            to:
                screen.id === loginErrors.default.id
                    ? "sign-in"
                    : `${screen.id}-exit`,
            label:
                Object.values(loginErrors).find(
                    (error) => error.id === screen.id,
                )?.action.label ?? "Open dashboard",
            alternate: true,
        },
    ]),
    {
        from: "enter-connected",
        to: "account-checkout",
        label: "Buy Pollen",
        fromSide: "bottom",
        toSide: "top",
    },
    {
        from: "account-checkout",
        to: "enter-connected",
        label: "Payment confirmed",
        fromSide: "left",
        toSide: "left",
        via: [
            [2080, 3990],
            [2080, 3370],
        ],
    },
    {
        from: "account-checkout",
        to: "enter-connected",
        label: "Canceled · balance unchanged",
        fromSide: "right",
        toSide: "right",
        via: [
            [2460, 3990],
            [2460, 3370],
        ],
        alternate: true,
    },
    {
        from: "account-checkout",
        to: "account-checkout",
        label: "Payment pending",
        fromSide: "bottom",
        toSide: "left",
        via: [
            [2260, 4280],
            [2040, 4280],
            [2040, 3990],
        ],
        alternate: true,
    },
    {
        from: "account-checkout",
        to: "account-checkout",
        label: "Payment failed · retry",
        fromSide: "right",
        toSide: "bottom",
        via: [
            [2510, 3990],
            [2510, 4290],
            [2260, 4290],
        ],
        alternate: true,
    },
    {
        from: "add-pollen-checkout",
        to: "add-pollen-checkout",
        label: "Payment failed · retry",
        fromSide: "right",
        toSide: "bottom",
        via: [
            [5880, 1100],
            [5880, 1370],
            [5630, 1370],
        ],
        alternate: true,
    },
    {
        from: "keys",
        to: "key-edit",
        label: "Edit",
        fromSide: "bottom",
        toSide: "top",
    },
    {
        from: "key-edit",
        to: "keys",
        label: "Save / cancel",
        fromSide: "left",
        toSide: "left",
        via: [
            [2630, 4000],
            [2630, 3365],
        ],
        alternate: true,
    },
    {
        from: "keys",
        to: "key-delete",
        label: "Delete",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [2810, 3670],
            [3300, 3670],
        ],
    },
    {
        from: "key-delete",
        to: "keys",
        label: "Confirm / cancel",
        fromSide: "right",
        toSide: "right",
        via: [
            [3520, 3990],
            [3520, 3650],
            [2920, 3650],
        ],
        alternate: true,
    },
    {
        from: "device-result",
        to: "device-done",
        label: "Authorized · return to device",
        fromSide: "top",
        toSide: "top",
        via: [
            [2245, 2390],
            [3550, 2390],
        ],
    },
    {
        from: "device-result",
        to: "device-stopped",
        label: "Denied · return to device",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2245, 2980],
            [3120, 2980],
        ],
        alternate: true,
    },
    {
        from: "add-pollen-amount",
        to: "add-pollen-amount",
        label: "Budget update failed · retry",
        fromSide: "right",
        toSide: "bottom",
        via: [
            [4500, 710],
            [4320, 710],
        ],
        alternate: true,
    },
    {
        from: "add-pollen-amount",
        to: "add-pollen-failed",
        label: "Invalid / expired / unavailable",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [5070, 950],
            [5070, 1760],
            [5630, 1760],
        ],
        labelAt: [5070, 1550],
        alternate: true,
    },
    {
        from: "add-pollen-failed",
        to: "add-pollen-unchanged",
        label: "Return manually · start again",
        alternate: true,
    },
    {
        from: "add-pollen-amount",
        to: "github-session",
        label: "Session expired · sign in",
        fromSide: "left",
        toSide: "bottom",
        via: [
            [4530, 800],
            [4050, 800],
            [4050, 2300],
            [1245, 2300],
        ],
        labelAt: [3600, 2300],
        alternate: true,
    },
    {
        from: "resume",
        to: "add-pollen-amount",
        label: "Continue top-up",
        fromSide: "right",
        toSide: "top",
        via: [
            [4010, 1235],
            [4010, 95],
            [4770, 95],
        ],
        labelAt: [4390, 95],
    },
    {
        from: "github-authorize",
        to: "add-pollen-failed",
        label: "Top-up sign-in denied",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2350, 2260],
            [5630, 2260],
        ],
        labelAt: [4470, 2260],
        alternate: true,
    },
    {
        from: "loading",
        to: "add-pollen-failed",
        label: "Top-up sign-in failed",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2810, 2210],
            [5630, 2210],
        ],
        labelAt: [4750, 2210],
        alternate: true,
    },
    { from: "app-connected", to: "add-pollen-amount", label: "Add Pollen" },
    {
        from: "add-pollen-amount",
        to: "enter-connected",
        label: "Open dashboard",
        alternate: true,
    },
    {
        from: "add-pollen-amount",
        to: "add-pollen-covered",
        label: "Save budget",
    },
    {
        from: "add-pollen-amount",
        to: "add-pollen-checkout",
        label: "Buy account pollen",
        fromSide: "bottom",
        toSide: "left",
    },
    {
        from: "add-pollen-covered",
        to: "add-pollen-increased",
        label: "Yes · no payment, no Pollen spent",
        fromSide: "top",
        toSide: "left",
        via: [
            [5185, 290],
            [6850, 290],
            [6850, 390],
        ],
        labelAt: [6020, 290],
    },
    {
        from: "add-pollen-covered",
        to: "add-pollen-checkout",
        label: "No · smallest pack covering the shortfall",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [5185, 770],
            [5630, 770],
        ],
        labelAt: [5540, 770],
    },
    {
        from: "add-pollen-checkout",
        to: "add-pollen-credited",
        label: "Payment confirmed",
    },
    {
        from: "add-pollen-checkout",
        to: "add-pollen-pending",
        label: "Return to app · payment pending",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [5630, 1410],
            [6130, 1410],
        ],
        labelAt: [5790, 1410],
    },
    {
        from: "add-pollen-pending",
        to: "add-pollen-pending",
        label: "Still pending / check failed · retry",
        fromSide: "right",
        toSide: "bottom",
        via: [
            [6360, 1705],
            [6360, 2010],
            [6130, 2010],
        ],
        labelAt: [6360, 1940],
        alternate: true,
    },
    {
        from: "add-pollen-pending",
        to: "add-pollen-credited",
        label: "Payment confirmed",
        fromSide: "top",
        toSide: "bottom",
        via: [
            [6130, 1390],
            [6670, 1390],
        ],
        labelAt: [6470, 1390],
    },
    {
        from: "add-pollen-credited",
        to: "add-pollen-amount",
        label: "Balance updated · review app budget",
        fromSide: "left",
        toSide: "bottom",
        via: [
            [6460, 1260],
            [4320, 1260],
        ],
        labelAt: [4920, 1260],
    },
    {
        from: "add-pollen-increased",
        to: "app-connected",
        label: "Return to app · updated balance + budget",
        fromSide: "right",
        toSide: "top",
        via: [
            [7350, 390],
            [7350, 75],
            [3550, 75],
        ],
        labelAt: [6200, 75],
    },
    {
        from: "add-pollen-checkout",
        to: "add-pollen-unchanged",
        label: "Checkout canceled · no increase",
        fromSide: "right",
        toSide: "right",
        via: [
            [5840, 1115],
            [5840, 1840],
        ],
        labelAt: [5840, 1240],
        alternate: true,
    },
    {
        from: "add-pollen-amount",
        to: "add-pollen-unchanged",
        label: "Cancel",
        fromSide: "bottom",
        toSide: "left",
        via: [[4320, 1840]],
        labelAt: [4320, 1200],
        alternate: true,
    },
    {
        from: "add-pollen-pending",
        to: "add-pollen-unchanged",
        label: "Close while pending · no increase yet",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [6130, 2070],
            [4790, 2070],
        ],
        labelAt: [5450, 2070],
        alternate: true,
    },
    {
        from: "add-pollen-unchanged",
        to: "app-connected",
        label: "Keep existing connection",
        fromSide: "left",
        toSide: "bottom",
        via: [
            [4120, 1840],
            [4120, 740],
            [3550, 740],
        ],
        labelAt: [4120, 1530],
        alternate: true,
    },
    {
        from: "add-pollen-pending",
        to: "app-connected",
        label: "Back to app · same app key",
        fromSide: "top",
        toSide: "top",
        via: [
            [6420, 1410],
            [6420, 125],
            [3550, 125],
        ],
        labelAt: [5820, 125],
    },
    {
        from: "app-connected",
        to: "enter-connected",
        label: "Dashboard · new tab",
        fromSide: "right",
        toSide: "top",
    },
    {
        from: "dashboard-connected",
        to: "enter-connected",
        label: "Dashboard link",
        fromSide: "top",
        toSide: "bottom",
        via: [
            [2810, 3700],
            [2260, 3700],
        ],
    },

    { from: "session", to: "sign-in", label: "No" },
    {
        from: "session",
        to: "resume",
        label: "Yes · reuse Pollinations session",
        fromSide: "top",
        toSide: "top",
        via: [
            [595, 990],
            [3165, 990],
        ],
        labelAt: [1770, 990],
    },
    { from: "sign-in", to: "github-session", label: "Sign in" },
    { from: "github-session", to: "github-login", label: "No" },
    {
        from: "github-session",
        to: "github-approval",
        label: "Yes",
        fromSide: "top",
        toSide: "top",
        via: [
            [1245, 1030],
            [1985, 1030],
        ],
        labelAt: [1820, 1030],
    },
    { from: "github-login", to: "github-approval", label: "Signed in" },
    {
        from: "github-login",
        to: "github-signup",
        label: "New GitHub account",
        fromSide: "bottom",
        toSide: "top",
    },
    {
        from: "github-signup",
        to: "github-authorize",
        label: "Continue after signup",
    },
    {
        from: "github-signup",
        to: "github-login",
        label: "Cancel",
        alternate: true,
    },
    { from: "github-approval", to: "github-authorize", label: "Yes" },
    {
        from: "github-approval",
        to: "loading",
        label: "No · already approved",
        fromSide: "top",
        toSide: "top",
        via: [
            [1985, 1015],
            [2810, 1015],
        ],
        labelAt: [2540, 1015],
    },
    { from: "github-authorize", to: "loading", label: "Authorize" },
    {
        from: "loading",
        to: "resume",
        label: "Account ready · created if needed",
        labelAt: [3010, 1330],
    },
    {
        from: "loading",
        to: "error",
        label: "Sign-in failed",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2810, 1650],
            [3550, 1650],
        ],
        alternate: true,
    },
    {
        from: "github-authorize",
        to: "error",
        label: "Denied / interrupted",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [2350, 1630],
            [3350, 1630],
            [3350, 1030],
            [3550, 1030],
        ],
        labelAt: [3050, 1630],
        alternate: true,
    },
    { from: "error", to: "cancelled", label: "Cancel", alternate: true },
    {
        from: "error",
        to: "github-session",
        label: "Try again",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [3550, 2260],
            [760, 2260],
            [760, 1610],
            [930, 1610],
        ],
        labelAt: [3000, 2260],
        alternate: true,
    },
    { from: "request-valid", to: "consent", label: "Yes" },
    {
        from: "request-valid",
        to: "blocked",
        label: "No",
        fromSide: "bottom",
        toSide: "top",
        alternate: true,
    },
    {
        from: "consent",
        to: "consent",
        label: "Save failed · retry",
        fromSide: "right",
        toSide: "bottom",
        via: [
            [2840, 435],
            [2840, 730],
            [2650, 730],
        ],
        labelAt: [2850, 650],
        alternate: true,
    },
    {
        from: "app-connected",
        to: "app-connect",
        label: "Disconnect app · Pollinations stays signed in",
        fromSide: "bottom",
        toSide: "left",
        via: [
            [3550, 860],
            [85, 860],
            [85, 435],
        ],
        labelAt: [1450, 860],
        alternate: true,
    },
    {
        from: "consent",
        to: "cancelled",
        label: "Cancel",
        fromSide: "bottom",
        toSide: "top",
        alternate: true,
    },
    {
        from: "device-start",
        to: "session",
        label: "Open verification URL",
        fromSide: "top",
        toSide: "left",
        via: [
            [220, 2300],
            [420, 2300],
            [420, 1235],
        ],
        labelAt: [420, 1850],
    },
    {
        from: "resume",
        to: "device-code",
        label: "Device",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [3165, 2310],
            [1300, 2310],
        ],
        labelAt: [3040, 2310],
    },
    {
        from: "device-code",
        to: "code-valid",
        label: "Continue / prefilled code",
    },
    {
        from: "code-valid",
        to: "device-code",
        label: "Invalid / used / expired · retry",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [1835, 2990],
            [1300, 2990],
        ],
        labelAt: [1560, 2990],
        alternate: true,
    },
    {
        from: "code-valid",
        to: "request-valid",
        label: "Yes · review device access",
        fromSide: "top",
        toSide: "left",
        via: [
            [1835, 2330],
            [2100, 2330],
            [2100, 405],
        ],
        labelAt: [2100, 2360],
    },
    {
        from: "device-start",
        to: "device-wait",
        label: "Poll for approval",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [220, 2980],
            [2640, 2980],
        ],
        labelAt: [760, 2980],
    },
    {
        from: "device-wait",
        to: "device-wait",
        label: "Pending · poll again",
        fromSide: "top",
        toSide: "right",
        via: [
            [2640, 2540],
            [2830, 2540],
            [2830, 2670],
        ],
        alternate: true,
    },
    {
        from: "consent",
        to: "device-result",
        label: "Allow access",
        fromSide: "bottom",
        toSide: "top",
        via: [
            [3065, 890],
            [3900, 890],
            [3900, 2380],
            [2245, 2380],
        ],
        labelAt: [3900, 1830],
    },
    {
        from: "device-wait",
        to: "device-done",
        label: "Approved · retrieve key",
    },
    {
        from: "device-wait",
        to: "device-stopped",
        label: "Denied / expired",
        fromSide: "bottom",
        toSide: "left",
        via: [[2640, 2870]],
        alternate: true,
    },
    {
        from: "cancelled",
        to: "device-result",
        label: "Device · deny",
        fromSide: "right",
        toSide: "right",
        via: [
            [3980, 800],
            [3980, 2870],
        ],
        labelAt: [3980, 2210],
        alternate: true,
    },
    {
        from: "device-stopped",
        to: "device-start",
        label: "Start again · new code",
        fromSide: "bottom",
        toSide: "left",
        via: [
            [3120, 3010],
            [85, 3010],
            [85, 2685],
        ],
        labelAt: [2900, 3010],
        alternate: true,
    },
    {
        from: "enter-signed-out",
        to: "github-session",
        label: "Sign in",
        fromSide: "top",
        toSide: "left",
        via: [
            [1060, 3070],
            [350, 3070],
            [350, 1235],
        ],
        labelAt: [350, 2400],
    },
    {
        from: "resume",
        to: "enter-connected",
        label: "Enter account",
        fromSide: "right",
        toSide: "top",
        via: [
            [3320, 1235],
            [3320, 3060],
            [2260, 3060],
        ],
        labelAt: [3320, 2290],
    },
    { from: "enter-connected", to: "keys", label: "API keys" },
    { from: "keys", to: "enter-connected", label: "Pollen", alternate: true },
    {
        from: "keys",
        to: "enter-signed-out",
        label: "Sign out of Pollinations",
        alternate: true,
    },
    { from: "keys", to: "api-key", label: "Create key" },
    {
        from: "keys",
        to: "app-key",
        label: "Register app",
        fromSide: "top",
        toSide: "top",
        via: [
            [2810, 3090],
            [3850, 3090],
        ],
        labelAt: [3520, 3090],
    },
    {
        from: "api-key",
        to: "keys",
        label: "Save / cancel",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [3300, 3650],
            [2810, 3650],
        ],
        alternate: true,
    },
    {
        from: "app-key",
        to: "keys",
        label: "Save / cancel",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [3850, 3670],
            [2810, 3670],
        ],
        labelAt: [3540, 3670],
        alternate: true,
    },
    {
        from: "enter-connected",
        to: "enter-signed-out",
        label: "Sign out of Pollinations",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2260, 3650],
            [1060, 3650],
        ],
        alternate: true,
    },
    {
        from: "dashboard-sign-in",
        to: "identity",
        label: "Sign in with Pollinations",
    },
    {
        from: "identity",
        to: "github-session",
        label: "Sign in with GitHub",
        fromSide: "top",
        toSide: "left",
        via: [
            [930, 4360],
            [320, 4360],
            [320, 1235],
        ],
        labelAt: [320, 2300],
    },
    {
        from: "resume",
        to: "admin",
        label: "Dashboard",
        fromSide: "right",
        toSide: "top",
        via: [
            [4070, 1235],
            [4070, 4380],
            [2225, 4380],
        ],
        labelAt: [4070, 2940],
    },
    { from: "admin", to: "dashboard-connected", label: "Yes" },
    {
        from: "admin",
        to: "dashboard-denied",
        label: "No",
        fromSide: "bottom",
        toSide: "top",
        alternate: true,
    },
    {
        from: "dashboard-denied",
        to: "identity",
        label: "Use an admin account",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2250, 4920],
            [220, 4920],
        ],
        labelAt: [1500, 4920],
        alternate: true,
    },
    {
        from: "dashboard-connected",
        to: "dashboard-sign-in",
        label: "Sign out",
        fromSide: "bottom",
        toSide: "bottom",
        via: [
            [2810, 4900],
            [220, 4900],
        ],
        labelAt: [950, 4900],
        alternate: true,
    },
];
export function nodeSize(node: FlowNode) {
    return node.screen
        ? { width: 220, height: 510 }
        : node.kind === "decision"
          ? { width: 170, height: 110 }
          : { width: 220, height: 80 };
}
export function edgePoints(
    edge: FlowEdge,
    nodes: FlowNode[] = flowNodes,
): [number, number][] {
    const anchor = (id: string, side: Side): [number, number] => {
        const node = nodes.find((node) => node.id === id);
        if (!node) throw new Error(`Unknown flow node: ${id}`);
        const { width, height } = nodeSize(node);
        return [
            node.x +
                (side === "left" ? 0 : side === "right" ? width : width / 2),
            node.y +
                (side === "top" ? 0 : side === "bottom" ? height : height / 2),
        ];
    };
    const start = anchor(edge.from, edge.fromSide ?? "right");
    const end = anchor(edge.to, edge.toSide ?? "left");
    const via: [number, number][] =
        edge.via ??
        (Math.abs(start[1] - end[1]) < 2 || Math.abs(start[0] - end[0]) < 2
            ? []
            : [
                  [(start[0] + end[0]) / 2, start[1]],
                  [(start[0] + end[0]) / 2, end[1]],
              ]);
    return [start, ...via, end];
}

// Flow membership follows the journey, including shared sign-in, not screen position.
const signInNodes = [
    ...enterLoginErrorScreens.map((screen) => screen.id),
    ...[loginErrors.banned, loginErrors.staging].map(
        (error) => `${error.id}-exit`,
    ),
    "session",
    "sign-in",
    "github-session",
    "github-login",
    "github-approval",
    "github-authorize",
    "loading",
    "resume",
    "error",
    "github-signup",
];
const flowMembership: Record<FlowId, readonly string[]> = {
    "add-pollen": [
        ...enterLoginErrorScreens.map((screen) => screen.id),
        ...[loginErrors.banned, loginErrors.staging].map(
            (error) => `${error.id}-exit`,
        ),
        "app-connected",
        "github-session",
        "github-login",
        "github-approval",
        "github-authorize",
        "github-signup",
        "loading",
        "resume",
        ...flowNodes
            .filter((node) => node.id.startsWith("add-pollen-"))
            .map((node) => node.id),
    ],
    app: appLoginNodes.map((node) => node.id),
    "sign-in": signInNodes,
    device: [
        ...signInNodes,
        "device-start",
        "device-code",
        "code-valid",
        "device-wait",
        "device-done",
        "device-result",
        "device-stopped",
        "request-valid",
        "consent",
        "blocked",
        "cancelled",
    ],
    account: [
        ...signInNodes,
        "enter-signed-out",
        "enter-connected",
        "account-checkout",
        "keys",
        "api-key",
        "app-key",
        "key-edit",
        "key-delete",
    ],
    admin: [
        ...signInNodes,
        "dashboard-sign-in",
        "identity",
        "admin",
        "dashboard-connected",
        "dashboard-denied",
    ],
};

export function getFlowFocus(id: FlowId, section?: "main" | "topup") {
    const selectedFlow =
        id === "app" && section === "topup" ? "add-pollen" : id;
    let members = flowMembership[selectedFlow];
    if (selectedFlow === "add-pollen" && section === "topup")
        members = [
            "app-connect",
            ...members.filter(
                (node) =>
                    node === "app-connected" || node.startsWith("add-pollen-"),
            ),
        ];
    if (id === "account" && section === "main")
        members = members.filter((node) => node !== "account-checkout");
    if (id === "account" && section === "topup")
        members = ["enter-connected", "account-checkout"];
    const appLogin = id === "app" && section !== "topup";
    const nodeIds = new Set(
        appLogin ? appLoginNodes.map((node) => node.id) : members,
    );
    const nodes = (appLogin ? appLoginNodes : flowNodes).filter((node) =>
        nodeIds.has(node.id),
    );
    const edges = (appLogin ? appLoginEdges : flowEdges)
        .map((edge) =>
            edge.from === "login-failed"
                ? { ...edge, to: loginRetryNode(id) }
                : edge,
        )
        .filter(
            (edge) =>
                nodeIds.has(edge.from) &&
                nodeIds.has(edge.to) &&
                // The device sign-in page has no app-cancellation button.
                !(
                    id === "device" &&
                    edge.from === "sign-in" &&
                    edge.to === "cancelled"
                ),
        );
    if (id === "app" && section === "topup") {
        // Authentication is the same Apps Login flow, represented here as a
        // handoff instead of duplicating its account and consent screens.
        const start = nodes.find((node) => node.id === "app-connect");
        const connected = nodes.find((node) => node.id === "app-connected");
        if (!start || !connected)
            throw new Error("Missing app top-up entry screens");
        nodes[nodes.indexOf(start)] = { ...start, x: connected.x - 620 };
        nodes.push({
            id: "app-login",
            kind: "outcome",
            label: "Apps · Login",
            note: "Shared login flow · return to the app",
            x: connected.x - 310,
            y: connected.y + 200,
        });
        nodeIds.add("app-login");
        edges.push(
            {
                from: "app-connect",
                to: "app-login",
                label: "Connect with Pollinations",
            },
            {
                from: "app-login",
                to: "app-connected",
                label: "Return signed in",
            },
        );
    }
    const points: [number, number][] = nodes.flatMap((node) => {
        const size = nodeSize(node);
        return [
            [node.x - 12, node.y - 12],
            [node.x + size.width + 12, node.y + size.height + 12],
        ];
    });
    for (const edge of edges) {
        const path = edgePoints(edge, nodes);
        points.push(...path);
        const [x, y] = edgeLabelPosition(edge, nodes);
        const halfLabel = edge.label.length * 4.5;
        points.push([x - halfLabel, y - 30], [x + halfLabel, y + 8]);
    }
    const x = Math.min(...points.map(([x]) => x));
    const y = Math.min(...points.map(([, y]) => y));
    return {
        nodeIds,
        nodes,
        edges,
        bounds: {
            x,
            y,
            width: Math.max(...points.map(([x]) => x)) - x,
            height: Math.max(...points.map(([, y]) => y)) - y,
        },
    };
}

export function edgeLabelPosition(
    edge: FlowEdge,
    nodes: FlowNode[] = flowNodes,
): [number, number] {
    if (edge.labelAt) return edge.labelAt;
    const points = edgePoints(edge, nodes);
    const middle = Math.floor((points.length - 1) / 2);
    return [
        (points[middle][0] + points[middle + 1][0]) / 2,
        (points[middle][1] + points[middle + 1][1]) / 2,
    ];
}
