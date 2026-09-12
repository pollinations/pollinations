import { loginErrors } from "@shared/auth/login-errors.ts";
import {
    accountActionEdges,
    accountActionNodes,
} from "./pollen-connect-account-actions";
import { adminEdges, adminNodes } from "./pollen-connect-admin";
import { appLoginEdges, appLoginNodes } from "./pollen-connect-app-login";
import { enterLoginErrorScreens } from "./pollen-connect-canvas-data";
import { getDashboardFlow } from "./pollen-connect-dashboard";
import { getDeviceFlow } from "./pollen-connect-device";
import type { JourneySection } from "./pollen-connect-journey-state";

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
        title: "App access and wallet",
        note: "Separate owner-only key editor and wallet destinations",
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
        kind: "outcome",
        label: "Return to dashboard",
        note: "Original destination",
        x: 3080,
        y: 1180,
    },
    { id: "error", kind: "outcome", label: "Sign-in failed", x: 3440, y: 1060 },
    { id: "github-signup", screen: "github-signup", x: 1460, y: 1700 },
    { id: "enter-signed-out", screen: "enter-signed-out", x: 950, y: 3110 },
    { id: "enter-connected", screen: "enter-connected", x: 2150, y: 3110 },
    { id: "account-checkout", screen: "account-checkout", x: 2150, y: 3730 },
    { id: "keys", screen: "keys", x: 2700, y: 3110 },
    { id: "key-edit", screen: "key-edit", x: 2700, y: 3730 },
    { id: "key-delete", screen: "key-delete", x: 3190, y: 3730 },
    { id: "api-key", screen: "api-key", x: 3190, y: 3110 },
    { id: "app-key", screen: "app-key", x: 3740, y: 3110 },
    ...adminNodes.filter((node) => !node.id.endsWith("-exit")),
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
        from: "app-connected",
        to: "enter-connected",
        label: "Dashboard · new tab",
        fromSide: "right",
        toSide: "top",
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
    ...adminEdges,
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
    "add-pollen": accountActionNodes.map((node) => node.id),
    app: appLoginNodes.map((node) => node.id),
    "sign-in": signInNodes,
    device: getDeviceFlow().nodes.map((node) => node.id),
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
    admin: adminNodes.map((node) => node.id),
};

export function getFlowFocus(id: FlowId, section?: JourneySection) {
    const selectedFlow =
        id === "app" && section === "topup" ? "add-pollen" : id;
    let members = flowMembership[selectedFlow];
    if (id === "account" && section === "main")
        members = members.filter((node) => node !== "account-checkout");
    if (id === "account" && section === "topup")
        members = ["enter-connected", "account-checkout"];
    const appLogin = id === "app" && section !== "topup";
    const deviceMap = id === "device" ? getDeviceFlow(section).map : null;
    const accountActions = selectedFlow === "add-pollen";
    const dashboard = id === "account" ? getDashboardFlow(section) : null;
    const sourceNodes =
        id === "admin"
            ? adminNodes
            : dashboard
              ? dashboard.nodes
              : accountActions
                ? accountActionNodes
                : appLogin
                  ? appLoginNodes
                  : deviceMap
                    ? deviceMap.nodes
                    : flowNodes;
    const sourceEdges =
        id === "admin"
            ? adminEdges
            : dashboard
              ? dashboard.edges
              : accountActions
                ? accountActionEdges
                : appLogin
                  ? appLoginEdges
                  : deviceMap
                    ? deviceMap.edges
                    : flowEdges;
    const nodeIds = new Set(
        dashboard || accountActions || appLogin || deviceMap
            ? sourceNodes.map((node) => node.id)
            : members,
    );
    const nodes = sourceNodes.filter((node) => nodeIds.has(node.id));
    const edges = sourceEdges
        .map((edge) =>
            edge.from === "login-failed" && id !== "device" && id !== "account"
                ? { ...edge, to: loginRetryNode(id) }
                : edge,
        )
        .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
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
