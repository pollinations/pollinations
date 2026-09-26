import { type CanvasScreen, canvasGroups } from "./flow-canvas-data";
import type { FlowEdge, FlowNode } from "./flow-diagram";
import { galleryCardsForFlow, galleryPagesForFlow } from "./flow-gallery-data";
import { loginSituations } from "./review-auth";

// Apps Login has one screen inventory. Map positions and Journey transitions
// reference these exact gallery entries, including their real preview parameters.
const cards = galleryCardsForFlow("app", "main");
const sources = canvasGroups.flatMap((group) => group.screens);
const bindings: [string, (entry: CanvasScreen) => boolean, number, number][] = [
    ["sign-in", (e) => e.id === "sign-in--default", 3, 0],
    [
        "app-signing-in",
        (e) =>
            e.variants?.[0].params?.action === "sign-in" &&
            e.variants[0].params.result === "waiting",
        4,
        0,
    ],
    ["error", (e) => e.id.startsWith("sign-in-errors"), 4, 1],
    ["blocked", (e) => e.id.startsWith("connection-link"), 2, 2],
    ["loading", (e) => e.id.startsWith("loading"), 1, 0],
    ["consent", (e) => e.id === "consent", 6, 0],
    [
        "app-connecting",
        (e) =>
            e.variants?.[0].params?.action === "authorize" &&
            e.variants[0].params.result === "waiting",
        7,
        0,
    ],
    [
        "app-connection-failed",
        (e) =>
            e.variants?.[0].params?.action === "authorize" &&
            e.variants[0].params.result === "error",
        7,
        1,
    ],
    ...Object.values(loginSituations).map(
        (error, index): (typeof bindings)[number] => [
            error.id,
            (e) => e.id.startsWith(error.id),
            1 + index,
            3,
        ],
    ),
];
export const appLoginScreens = new Map<string, CanvasScreen>(
    bindings.map(([id, match]) => {
        // Callback failure shares the gallery UI but remains a distinct arrival
        // in Map/Journey, using its original /error route and retry context.
        const entries = [
            "app-signing-in",
            "app-connecting",
            "app-connection-failed",
            "loading",
            ...Object.values(loginSituations).map((error) => error.id),
        ].includes(id)
            ? galleryPagesForFlow("app", "main")
            : cards;
        const matches = entries.filter(match);
        if (
            !matches.length ||
            (matches.length !== 1 && id !== "app-connection-failed")
        )
            throw new Error(
                `Apps Login needs one screen for ${id}, found ${matches.length}`,
            );
        return [
            id,
            matches.length === 1
                ? matches[0]
                : {
                      ...matches[0],
                      title: "App connection error",
                      variants: matches.flatMap(
                          (entry) => entry.variants ?? [],
                      ),
                  },
        ];
    }),
);
// App lookup changes the current screen's busy state, not the user's task.
// Journey renders that exact variant; Map shows the validation as a decision.
const appChecks = [
    { id: "app-sign-in-checking", screen: "oauth-signed-out", row: 0 },
    { id: "app-checking", screen: "oauth", row: 1 },
];
for (const check of appChecks) {
    const entry = galleryPagesForFlow("app", "main").find(
        (entry) =>
            entry.screen === check.screen &&
            entry.variants?.[0].params?.app_loading === "1",
    );
    if (!entry) throw new Error(`Missing app lookup state: ${check.id}`);
    appLoginScreens.set(check.id, entry);
}
const external: [string, number, number][] = [
    ["app-connect", 0, 0],
    ["app-connected", 9, 0],
    ["github-handoff", 5, 0],
];
for (const [id] of external) {
    const entry =
        cards.find((entry) => entry.id === id) ??
        sources.find((entry) => entry.id === id);
    if (!entry) throw new Error(`Missing app handoff: ${id}`);
    appLoginScreens.set(id, entry);
}
// These are outcomes inside the same optional host-app panel, not additional pages.
const panelStates: [string, string[], number, number][] = [
    ["app-callback", ["waiting"], 8, 0],
    ["app-callback-error", ["error", "denied"], 9, 1],
];
const panel = appLoginScreens.get("app-connected");
if (!panel) throw new Error("Missing connection panel");
for (const [id, states] of panelStates) {
    const variants = panel.variants?.filter((variant) =>
        states.includes(
            variant.params?.app_callback ?? variant.params?.app_account ?? "",
        ),
    );
    if (!variants?.length)
        throw new Error(`Missing connection panel state: ${id}`);
    appLoginScreens.set(id, {
        ...panel,
        id: `${panel.id}--${states[0]}`,
        title: `App panel · ${variants[0].label}`,
        variants,
    });
}
export const appLoginNodes: FlowNode[] = [
    ...appChecks.map(
        ({ id, row }): FlowNode => ({
            id,
            kind: "decision",
            label: "App verified?",
            note: row === 0 ? "Before sign-in" : "Before approval",
            x: 840,
            y: 100 + row * 740,
        }),
    ),
    ...panelStates.map(([id, , column, row]) => ({
        id,
        screen: appLoginScreens.get(id)?.id,
        x: 100 + column * 370,
        y: 100 + row * 740,
    })),
    ...[loginSituations.banned, loginSituations.staging].map(
        (error, index): FlowNode => ({
            id: `${error.id}-exit`,
            kind: "outcome",
            label: error.action.label,
            note: error.action.href.replace("mailto:", ""),
            x: 470 + index * 370,
            y: 3000,
        }),
    ),
    ...bindings.map(([id, , column, row]) => ({
        id,
        screen: appLoginScreens.get(id)?.id,
        x: 100 + column * 370,
        y: 100 + row * 740,
    })),
    ...external.map(([id, column, row]) => ({
        id,
        screen: id,
        x: 100 + column * 370,
        y: 100 + row * 740,
    })),
    {
        id: "app-ready",
        kind: "decision",
        label: "Open app · Stored key?",
        x: 100,
        y: 760,
    },
    {
        id: "cancelled",
        kind: "outcome",
        label: "Return to app",
        note: "access_denied · no access granted",
        x: 3060,
        y: 760,
    },
    {
        id: "account-key-editor",
        kind: "outcome",
        label: "App access",
        note: "Opens the existing key editor on Pollinations in a separate tab",
        x: 3060,
        y: 1400,
    },
    {
        id: "app-home",
        kind: "outcome",
        label: "Open dashboard",
        note: "Balance when signed in · News and sign-in otherwise",
        x: 100,
        y: 1400,
    },
    {
        id: "account-funding",
        kind: "outcome",
        label: "Top up account",
        note: "Opens account top-up in a new tab. Return to the app’s request to finish connecting.",
        x: 2320,
        y: 1400,
    },
];
export const appLoginEdges: FlowEdge[] = [
    {
        from: "app-connected",
        to: "account-funding",
        label: "Wallet",
        alternate: true,
    },
    ...[loginSituations.banned, loginSituations.staging].map((error) => ({
        from: error.id,
        to: `${error.id}-exit`,
        label: error.action.label,
    })),
    {
        from: "app-connect",
        to: "loading",
        label: "Pollinations Connect",
    },
    { from: "app-ready", to: "app-connected", label: "Restore saved key" },
    { from: "app-ready", to: "app-connect", label: "No stored key" },
    {
        from: "app-connect",
        to: "app-callback-error",
        label: "Could not start authorization",
        alternate: true,
    },
    {
        from: "loading",
        to: "app-sign-in-checking",
        label: "Signed out · app lookup pending",
    },
    {
        from: "loading",
        to: "app-checking",
        label: "Signed in · app lookup pending",
    },
    {
        from: "loading",
        to: "sign-in",
        label: "Signed out · app already verified",
    },
    {
        from: "loading",
        to: "consent",
        label: "Signed in · app already verified",
    },
    {
        from: "loading",
        to: "blocked",
        label: "Invalid request or app lookup failure",
        alternate: true,
    },
    ...Object.values(loginSituations).map((error) => ({
        from: "github-handoff",
        to: error.id,
        label: error.title,
        alternate: true,
    })),
    { from: "app-sign-in-checking", to: "sign-in", label: "App verified" },
    {
        from: "app-sign-in-checking",
        to: "blocked",
        label: "Request rejected",
        alternate: true,
    },
    { from: "sign-in", to: "app-signing-in", label: "Sign in with GitHub" },
    { from: "login-failed", to: "app-signing-in", label: "Try again" },
    {
        from: "login-failed",
        to: "cancelled",
        label: "Back to app",
        alternate: true,
    },
    { from: "blocked", to: "app-connect", label: "Back to app" },
    { from: "sign-in", to: "cancelled", label: "Back to app", alternate: true },
    { from: "app-signing-in", to: "github-handoff", label: "Open GitHub" },
    {
        from: "app-signing-in",
        to: "error",
        label: "Could not start sign-in",
        alternate: true,
    },
    { from: "error", to: "app-signing-in", label: "Try again" },
    { from: "error", to: "cancelled", label: "Back to app", alternate: true },
    { from: "github-handoff", to: "loading", label: "Return to Pollinations" },

    { from: "app-checking", to: "consent", label: "App verified" },
    {
        from: "app-checking",
        to: "blocked",
        label: "Invalid request or app lookup failure",
        alternate: true,
    },
    { from: "blocked", to: "app-checking", label: "Try again" },
    { from: "blocked", to: "app-sign-in-checking", label: "Try again" },
    { from: "consent", to: "app-connecting", label: "Allow access" },
    { from: "consent", to: "cancelled", label: "Back to app", alternate: true },
    {
        from: "app-connecting",
        to: "app-callback",
        label: "Callback: code (OAuth)",
    },
    {
        from: "app-connecting",
        to: "app-connected",
        label: "Callback: key (legacy BYOP)",
    },
    {
        from: "app-connecting",
        to: "app-connection-failed",
        label: "Authorization failed",
        alternate: true,
    },
    {
        from: "app-connection-failed",
        to: "cancelled",
        label: "Back to app",
        alternate: true,
    },
    { from: "cancelled", to: "app-connect", label: "Legacy app return" },
    {
        from: "cancelled",
        to: "app-callback-error",
        label: "SDK receives access_denied",
    },
    {
        from: "app-callback",
        to: "app-connected",
        label: "Key restored or OAuth token exchanged",
    },
    {
        from: "app-callback",
        to: "app-callback-error",
        label: "OAuth callback failed",
        alternate: true,
    },
    {
        from: "app-callback-error",
        to: "loading",
        label: "Pollinations Connect",
    },
    {
        from: "app-connected",
        to: "app-connect",
        label: "Disconnect app",
        action: "disconnect",
    },
    {
        from: "app-connected",
        to: "app-connect",
        label: "Key expired or revoked",
        alternate: true,
    },
    {
        from: "app-connected",
        to: "account-key-editor",
        label: "App access",
        alternate: true,
    },
    {
        from: "app-connected",
        to: "app-home",
        label: "Open dashboard",
        action: "dashboard",
        alternate: true,
    },
    {
        from: "consent",
        to: "app-home",
        label: "Open dashboard",
        action: "dashboard",
        alternate: true,
    },
    {
        from: "consent",
        to: "account-funding",
        label: "Top up account",
        action: "fund-account",
        alternate: true,
    },
];
