import { loginErrors } from "@shared/auth/login-errors.ts";
import {
    type CanvasScreen,
    canvasGroups,
    modelCatalogStates,
} from "./pollen-connect-canvas-data";
import type { FlowEdge, FlowNode } from "./pollen-connect-diagram";
import type {
    JourneySection,
    JourneySettings,
    JourneyState,
} from "./pollen-connect-journey-state";

// Each state owns its real preview parameters. Screens groups these by layout;
// Map and Journey reference the same entries, including recovery and busy states.
type DeviceState = {
    id: string;
    family: string;
    entry: CanvasScreen;
    column: number;
    row: number;
    decision?: string;
};
const source = (id: string) => {
    const entry = canvasGroups
        .flatMap((group) => group.screens)
        .find((entry) => entry.id === id);
    if (!entry) throw new Error(`Missing shared device screen: ${id}`);
    return entry;
};
const state = (
    id: string,
    family: string,
    screen: string,
    label: string,
    column: number,
    row: number,
    params: Record<string, string> = {},
    decision?: string,
): DeviceState => ({
    id,
    family,
    column,
    row,
    decision,
    entry: {
        id,
        title: label,
        owner: "Pollinations",
        screen,
        variants: [{ label, params }],
    },
});
export const deviceCodeResults = [
    { id: "ready", label: "Valid code" },
    { id: "invalid", label: "Invalid code" },
    { id: "expired", label: "Expired code" },
    { id: "used", label: "Used code" },
    { id: "unavailable", label: "Verification unavailable" },
] as const;
export const deviceRequestResults = [
    { id: "ready", label: "Request verified" },
    ...deviceCodeResults.slice(1),
    { id: "app", label: "App unavailable" },
    { id: "lookup", label: "App lookup unavailable" },
] as const;
export const deviceSubmitResults = [
    { id: "ready", label: "Success" },
    { id: "key", label: "Key creation failed" },
    { id: "approve", label: "Approval failed" },
    { id: "deny", label: "Decline failed" },
    { id: "session", label: "Session expired" },
] as const;
const states: DeviceState[] = [
    {
        id: "device-start",
        family: "device-start",
        entry: source("device-start"),
        column: 0,
        row: 0,
    },
    state(
        "device-session",
        "sign-in",
        "device-signed-out",
        "Checking account",
        1,
        0,
        { session: "loading" },
        "Signed in?",
    ),
    state(
        "sign-in",
        "sign-in",
        "device-signed-out",
        "Sign in to Pollinations",
        2,
        0,
    ),
    state(
        "device-signing-in",
        "sign-in",
        "device-signed-out",
        "Signing in",
        3,
        0,
        { action: "sign-in", result: "waiting" },
        "Open GitHub",
    ),
    {
        id: "github-handoff",
        family: "github-handoff",
        entry: source("github-handoff"),
        column: 4,
        row: 0,
    },
    state(
        "error",
        "sign-in-errors",
        "device-signed-out",
        "Starting sign-in",
        3,
        1,
        { action: "sign-in", result: "error" },
    ),
    ...[loginErrors.default, loginErrors.banned, loginErrors.staging].map(
        (error, index) => ({
            ...state(
                error.id,
                "sign-in-errors",
                error.id,
                error.id === "login-failed"
                    ? "Returning from GitHub"
                    : error.title,
                index + 1,
                2,
                { login_flow: "device", login_error: error.code },
            ),
        }),
    ),
    state("device-code", "device-code", "device", "Enter code", 5, 0),
    state(
        "device-verifying",
        "device-code",
        "device",
        "Verifying code",
        6,
        0,
        { user_code: "ABCD-EFGH", verify: "waiting" },
        "Code valid?",
    ),
    ...deviceCodeResults
        .slice(1)
        .map((result, index) =>
            state(
                `device-code-${result.id}`,
                "device-code",
                "device",
                result.label,
                5 + index,
                2,
                { user_code: "ABCD-EFGH", device_info: result.id },
            ),
        ),
    state(
        "device-checking",
        "consent",
        "device-consent",
        "Checking request",
        7,
        0,
        { verify: "waiting" },
        "Request verified?",
    ),
    state("consent", "consent", "device-consent", "Allow access", 8, 0),
    ...deviceRequestResults
        .slice(1)
        .map((result, index) =>
            state(
                `device-request-${result.id}`,
                "device-errors",
                "device-consent",
                result.label,
                6 + index,
                3,
                ["app", "lookup"].includes(result.id)
                    ? { request_error: result.id }
                    : { device_info: result.id },
            ),
        ),
    state(
        "device-approving",
        "consent",
        "device-consent",
        "Connecting",
        9,
        0,
        { action: "authorize", result: "waiting" },
        "Approval recorded?",
    ),
    state(
        "device-denying",
        "consent",
        "device-consent",
        "Declining",
        9,
        1,
        { action: "deny", result: "waiting" },
        "Decline recorded?",
    ),
    ...deviceSubmitResults.slice(1).map((result, index) =>
        state(
            `device-submit-${result.id}`,
            result.id === "session" ? "sign-in-errors" : "device-errors",
            "device-consent",
            result.label,
            9 + index,
            2,
            {
                action: result.id === "deny" ? "deny" : "authorize",
                result: "error",
                device_submit: result.id,
            },
        ),
    ),
    state(
        "device-result",
        "device-result",
        "device-result",
        "Access approved",
        10,
        0,
    ),
    state(
        "device-declined",
        "device-result",
        "device-result",
        "Connection declined",
        10,
        1,
        { outcome: "denied" },
    ),
    {
        id: "device-done",
        family: "device-done",
        entry: source("device-done"),
        column: 11,
        row: 0,
    },
];
// Attribution and catalog availability change the current screen, not the route.
const consent = states.find((item) => item.id === "consent");
const checking = states.find((item) => item.id === "device-checking");
if (!consent || !checking) throw new Error("Missing device sign-in or consent");
checking.entry.variants?.push({
    label: "Checking app",
    params: { app_loading: "1" },
});
consent.entry.variants = [
    { label: "Ready" },
    { label: "Without registered app", params: { device_client: "none" } },
    ...modelCatalogStates
        .filter((item) => item.id !== "ready")
        .map((item) => ({
            label: item.label,
            params: { model_catalog: item.id },
        })),
];
const familyTitles: Record<string, string> = {
    "sign-in": "Sign in to Pollinations",
    "sign-in-errors": "Pollinations sign-in error",
    "device-code": "Enter device code",
    consent: "Allow access",
    "device-errors": "Device connection error",
    "device-result": "Device approval result",
};
const familyOrder = [
    "device-start",
    "sign-in",
    "github-handoff",
    "sign-in-errors",
    "device-code",
    "consent",
    "device-errors",
    "device-result",
    "device-done",
];
const deviceNodes: FlowNode[] = [
    ...states.map((item) => ({
        id: item.id,
        x: 100 + item.column * 370,
        y: 100 + item.row * 740,
        ...(item.decision
            ? { kind: "decision" as const, label: item.decision }
            : { screen: item.entry.id }),
    })),
    {
        id: "device-stopped",
        kind: "outcome",
        label: "Device stopped",
        note: "Denied or code expired · no key received",
        x: 4170,
        y: 840,
    },
    {
        id: "device-home",
        kind: "outcome",
        label: "Open dashboard",
        note: "Opens separately; return to finish connecting",
        x: 3060,
        y: 3060,
    },
    ...[loginErrors.banned, loginErrors.staging].map((error, index) => ({
        id: `${error.id}-exit`,
        kind: "outcome" as const,
        label: error.action.label,
        note: error.action.href.replace("mailto:", ""),
        x: 470 + index * 370,
        y: 3060,
    })),
];
const edge = (
    from: string,
    to: string,
    label: string,
    alternate = false,
): FlowEdge => ({ from, to, label, ...(alternate ? { alternate } : {}) });
const deviceEdges: FlowEdge[] = [
    edge("device-start", "device-session", "Open verification URL"),
    edge("device-start", "device-session", "Open link with code"),
    edge("device-start", "device-stopped", "Code expired while waiting", true),
    edge("device-session", "sign-in", "Signed out"),
    edge("device-session", "device-code", "Signed in · enter code"),
    edge("device-session", "device-checking", "Signed in · resume request"),
    edge("device-session", "device-verifying", "Signed in · code in link"),
    edge("sign-in", "device-signing-in", "Sign in with GitHub"),
    edge("device-signing-in", "github-handoff", "Open GitHub"),
    edge("device-signing-in", "error", "Could not start sign-in", true),
    edge("error", "device-signing-in", "Try again"),
    edge("github-handoff", "device-session", "Return to Pollinations"),
    ...Object.values(loginErrors).map((error) =>
        edge("github-handoff", error.id, error.title, true),
    ),
    edge("login-failed", "device-session", "Try again"),
    edge("login-failed", "device-signing-in", "Try again"),
    ...[loginErrors.banned, loginErrors.staging].map((error) =>
        edge(error.id, `${error.id}-exit`, error.action.label),
    ),
    edge("device-code", "device-verifying", "Verify code"),
    edge("device-verifying", "device-checking", "Code verified"),
    ...deviceCodeResults
        .slice(1)
        .flatMap((result) => [
            edge(
                "device-verifying",
                `device-code-${result.id}`,
                result.label,
                true,
            ),
            edge(
                `device-code-${result.id}`,
                "device-verifying",
                result.id === "unavailable" ? "Try again" : "Verify code",
            ),
        ]),
    edge("device-checking", "consent", "Request verified"),
    ...deviceRequestResults
        .slice(1)
        .map((result) =>
            edge(
                "device-checking",
                `device-request-${result.id}`,
                result.label,
                true,
            ),
        ),
    ...["invalid", "expired", "used"].map((reason) =>
        edge(`device-request-${reason}`, "device-code", "Enter another code"),
    ),
    ...["unavailable", "lookup"].map((reason) =>
        edge(`device-request-${reason}`, "device-checking", "Try again"),
    ),
    ...["app", "lookup"].map((reason) =>
        edge(`device-request-${reason}`, "device-denying", "Cancel"),
    ),
    edge("consent", "device-approving", "Allow access"),
    edge("consent", "device-denying", "Cancel", true),
    {
        ...edge("consent", "device-home", "Open dashboard", true),
        action: "dashboard",
    },
    {
        ...edge("consent", "device-home", "Top up account", true),
        action: "fund-account",
    },
    edge("device-home", "consent", "Return to request"),
    edge("device-approving", "device-result", "Approval recorded"),
    ...["key", "approve", "session"].map((reason) =>
        edge(
            "device-approving",
            `device-submit-${reason}`,
            deviceSubmitResults.find((result) => result.id === reason)?.label ??
                reason,
            true,
        ),
    ),
    edge("device-denying", "device-declined", "Decline recorded"),
    ...["deny", "session"].map((reason) =>
        edge(
            "device-denying",
            `device-submit-${reason}`,
            deviceSubmitResults.find((result) => result.id === reason)?.label ??
                reason,
            true,
        ),
    ),
    ...["key", "approve", "deny"].flatMap((reason) => [
        edge(`device-submit-${reason}`, "device-denying", "Cancel"),
        edge(`device-submit-${reason}`, "device-checking", "Try again"),
    ]),
    edge("device-submit-session", "device-signing-in", "Sign in again"),
    edge("device-result", "device-done", "Device retrieves key"),
    edge("device-declined", "device-stopped", "Device receives denial"),
    edge("device-stopped", "device-start", "Start again · new code"),
];

// The submenu selects an entry context; all subsequent states stay shared.
export type DeviceEntry = "main" | "link";

// Map groups only errors with the same UI and recovery. Journey keeps each cause.
const deviceErrorGroups = [
    {
        title: "Code not accepted",
        ids: ["device-code-invalid", "device-code-expired", "device-code-used"],
    },
    {
        title: "Enter another code",
        ids: [
            "device-request-invalid",
            "device-request-expired",
            "device-request-used",
        ],
    },
    {
        title: "Approval failed",
        ids: ["device-submit-key", "device-submit-approve"],
    },
];

function deviceMap(
    screens: Map<string, CanvasScreen>,
    nodes: FlowNode[],
    edges: FlowEdge[],
) {
    const groups = new Map(
        deviceErrorGroups.flatMap((group) =>
            group.ids.map((id) => [id, group] as const),
        ),
    );
    const nodeForState = (id: string) => groups.get(id)?.ids[0] ?? id;
    const mapScreens = new Map(screens);
    for (const group of deviceErrorGroups) {
        const variants = group.ids.flatMap((id) => {
            const entry = screens.get(id);
            if (!entry) throw new Error(`Missing device error: ${id}`);
            mapScreens.delete(id);
            return (
                entry.variants?.map((variant) => ({
                    screen: entry.screen,
                    ...variant,
                })) ?? []
            );
        });
        mapScreens.set(group.ids[0], {
            id: group.ids[0],
            title: group.title,
            owner: "Pollinations",
            variants,
        });
    }
    const mapEdges = edges.map((edge) => ({
        ...edge,
        from: nodeForState(edge.from),
        to: nodeForState(edge.to),
        label:
            edge.from === "login-failed"
                ? `${edge.label} · from ${edge.to === "device-session" ? "device page" : "consent"}`
                : (groups.get(edge.to)?.title ?? edge.label),
    }));
    return {
        screens: mapScreens,
        nodes: nodes.filter((node) => nodeForState(node.id) === node.id),
        edges: [
            ...new Map(
                mapEdges.map((edge) => [
                    `${edge.from}:${edge.to}:${edge.label}`,
                    edge,
                ]),
            ).values(),
        ],
        nodeForState,
    };
}

function createDeviceFlow(section: DeviceEntry) {
    const linked = section === "link";
    const entries = states.map((item): DeviceState => {
        if (item.id === "device-start")
            return {
                ...item,
                entry: {
                    ...item.entry,
                    title: linked
                        ? "Device · Open device link"
                        : "Device · Enter code",
                    illustration: linked ? "device-link" : "device",
                },
            };
        if (
            item.entry.screen === "device-signed-out" ||
            item.id === "login-failed"
        )
            return {
                ...item,
                entry: {
                    ...item.entry,
                    variants: item.entry.variants?.map((variant) => ({
                        ...variant,
                        label: item.id === "sign-in" ? "Ready" : variant.label,
                        params: {
                            ...variant.params,
                            user_code: linked ? "ABCD-EFGH" : "",
                        },
                    })),
                },
            };
        return item;
    });
    const galleryScreens: CanvasScreen[] = [];
    for (const item of [...entries].sort(
        (a, b) => Number(b.id === b.family) - Number(a.id === a.family),
    )) {
        const existing = galleryScreens.find(
            (entry) => entry.id === item.family,
        );
        const variants = item.entry.variants?.map((variant) => ({
            screen: item.entry.screen,
            ...variant,
        }));
        if (existing)
            existing.variants = [
                ...(existing.variants ?? []),
                ...(variants ?? []),
            ];
        else
            galleryScreens.push({
                ...item.entry,
                id: item.family,
                title: familyTitles[item.family] ?? item.entry.title,
                variants,
            });
    }

    galleryScreens.sort(
        (a, b) => familyOrder.indexOf(a.id) - familyOrder.indexOf(b.id),
    );
    if (linked) {
        const code = galleryScreens.find((entry) => entry.id === "device-code");
        if (code) code.title = "Enter another code";
    }
    const flow = {
        screens: new Map(entries.map((item) => [item.id, item.entry])),
        galleryScreens,
        nodes: deviceNodes.map((node) =>
            linked && node.id === "device-code" ? { ...node, y: 840 } : node,
        ),
        edges: deviceEdges.filter((edge) => {
            if (edge.from === "device-start" && edge.to === "device-session")
                return (
                    edge.label ===
                    (linked ? "Open link with code" : "Open verification URL")
                );
            if (edge.from === "device-session") {
                if (edge.to === "device-code") return !linked;
                if (edge.to === "device-verifying") return linked;
            }
            return true;
        }),
    };
    return { ...flow, map: deviceMap(flow.screens, flow.nodes, flow.edges) };
}
const deviceFlows = {
    main: createDeviceFlow("main"),
    link: createDeviceFlow("link"),
};
export function getDeviceFlow(section: JourneySection = "main") {
    return deviceFlows[section === "link" ? "link" : "main"];
}

export function deviceAutomaticDestination(
    state: JourneyState,
    settings: JourneySettings,
): string | undefined {
    switch (state.node) {
        case "device-session":
            return !state.signedIn
                ? "sign-in"
                : state.deviceConsentRoute
                  ? "device-checking"
                  : state.deviceCode
                    ? "device-verifying"
                    : "device-code";
        case "device-signing-in":
            return settings.loginResult === "start"
                ? "error"
                : "github-handoff";
        case "device-verifying":
            return settings.deviceCodeResult === "ready"
                ? "device-checking"
                : `device-code-${settings.deviceCodeResult}`;
        case "device-checking":
            return settings.deviceRequestResult === "ready"
                ? "consent"
                : `device-request-${settings.deviceRequestResult}`;
        case "device-approving":
            return ["key", "approve", "session"].includes(
                settings.deviceSubmitResult,
            )
                ? `device-submit-${settings.deviceSubmitResult}`
                : "device-result";
        case "device-denying":
            return ["deny", "session"].includes(settings.deviceSubmitResult)
                ? `device-submit-${settings.deviceSubmitResult}`
                : "device-declined";
    }
    return undefined;
}

export function devicePreviewOverrides(
    state: JourneyState,
): Record<string, string> {
    const entry = getDeviceFlow(state.deviceEntry).screens.get(state.node);
    const screen = entry?.screen;
    return {
        ...(state.deviceConsentRoute && screen === "device-signed-out"
            ? { screen: "device-consent-signed-out" }
            : {}),
        device_route: state.deviceConsentRoute ? "authorize" : "device",
        ...(screen?.startsWith("device") || screen === "login-failed"
            ? {
                  user_code:
                      state.node === "device-code" ? "" : state.deviceCode,
              }
            : {}),
        ...(state.consent &&
        (screen === "device-consent" || state.node === "device-submit-session")
            ? { consent: JSON.stringify(state.consent) }
            : {}),
        // A 401 can occur during either mutation. The route, error and recovery
        // stay identical, but use the actual operation for the fixture.
        ...(state.node === "device-submit-session" && state.denied
            ? { action: "deny" }
            : {}),
    };
}
