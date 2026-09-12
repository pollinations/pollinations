import {
    getAccountPollenStatus,
    type PollenStatus,
} from "@pollinations/ui/wallet";
import { loginErrors } from "@shared/auth/login-errors.ts";
import { getAuthorizePollenBudget } from "../../shared/auth/authorize-config";

import { appLoginEdges } from "./pollen-connect-app-login";
import type {
    authorizeFailures,
    modelCatalogStates,
} from "./pollen-connect-canvas-data";
import { type DeviceEntry, getDeviceFlow } from "./pollen-connect-device";
import {
    type FlowEdge,
    flowEdges,
    loginRetryNode,
} from "./pollen-connect-diagram";
import type { AuthorizeConsent } from "./src/components/auth/authorize";

export const entrances = [
    { id: "app", label: "Apps", node: "app-connect" },
    { id: "device", label: "Devices", node: "device-start" },
    { id: "account", label: "Dashboard", node: "enter-signed-out" },
    { id: "admin", label: "Admin", node: "dashboard-sign-in" },
] as const;
export type JourneyEntrance = (typeof entrances)[number]["id"];
export type JourneyWorld = JourneyEntrance | "topup";
export type JourneySection =
    | "main"
    | "topup"
    | "link"
    | "keys"
    | "apps"
    | "models"
    | "agents"
    | "news"
    | "catalog"
    | "activity"
    | "quests"
    | "account";
export type JourneySelection = {
    world: JourneyEntrance;
    section: JourneySection;
    revision: number;
};
export type JourneyLocation = { world: JourneyWorld; node: string };
export type JourneySettings = {
    deviceCodeResult: "ready" | "invalid" | "expired" | "used" | "unavailable";
    deviceRequestResult: JourneySettings["deviceCodeResult"] | "app" | "lookup";
    deviceSubmitResult: "ready" | "key" | "approve" | "deny" | "session";
    githubSignedIn: boolean;
    githubApproved: boolean;
    paymentConfirmed: boolean;
    errors: boolean;
    appRequestError: string;
    authorizationError: "none" | (typeof authorizeFailures)[number]["id"];
    modelCatalog: (typeof modelCatalogStates)[number]["id"];
    slowAppLookup: boolean;
    appConnectionError: "none" | "start" | "callback";
    storedKeyStatus: "valid" | "invalid" | "unavailable";
    accountStatus: "ready" | "unavailable" | "unauthorized";
    appReturnPage: boolean;
    loginResult: "ready" | "start" | keyof typeof loginErrors;
};
export const defaultJourneySettings: JourneySettings = {
    deviceCodeResult: "ready",
    deviceRequestResult: "ready",
    deviceSubmitResult: "ready",
    githubSignedIn: true,
    githubApproved: true,
    paymentConfirmed: true,
    errors: false,
    appRequestError: "",
    authorizationError: "none",
    modelCatalog: "ready",
    slowAppLookup: false,
    appConnectionError: "none",
    storedKeyStatus: "valid",
    accountStatus: "ready",
    appReturnPage: true,
    loginResult: "ready",
};
export type JourneyState = {
    deviceEntry: DeviceEntry;
    deviceConsentRoute: boolean;
    deviceCode: string;
    node: string;
    world: JourneyWorld;
    paid: number;
    quest: number;
    budget: number;
    method: "oauth" | "direct";
    signedIn: boolean;
    connected: boolean;
    paidOnly: boolean;
    sharesUsage: boolean;
    payment: "idle" | "pending" | "canceled" | "completed";
    checkoutPack: number;
    scenario: string;
    denied: boolean;
    notice: string;
    consent: AuthorizeConsent | null;
};

export function applyJourneyConsent(
    state: JourneyState,
    consent: AuthorizeConsent,
): JourneyState {
    return {
        ...state,
        consent,
        budget:
            getAuthorizePollenBudget(
                consent.generationEnabled ? consent.allowedModels : [],
                consent.pollenBudget,
            ) ?? Number.POSITIVE_INFINITY,
        sharesUsage: consent.accountPermissions?.includes("usage") ?? false,
    };
}
export function startJourney(world: JourneyWorld = "app"): JourneyState {
    return {
        deviceEntry: "main",
        deviceConsentRoute: false,
        deviceCode: "",
        node:
            world === "topup"
                ? "account-app"
                : (entrances.find((entry) => entry.id === world)?.node ??
                  "app-connect"),
        world,
        paid: 10,
        quest: 5,
        budget: 5,
        method: "oauth",
        signedIn: world === "topup",
        connected: world === "topup",
        paidOnly: false,
        sharesUsage: true,
        payment: "idle",
        checkoutPack: 0,
        scenario: "",
        denied: false,
        notice: "",
        consent: null,
    };
}

export function startSelectedJourney(
    selection: Pick<JourneySelection, "world" | "section">,
): JourneyState {
    // Account actions have their own route-backed journey.
    if (selection.world === "app" && selection.section === "topup")
        return startJourney("topup");
    if (
        ["topup", "keys"].includes(selection.section) &&
        selection.world === "account"
    )
        return {
            ...startJourney("account"),
            node: selection.section === "keys" ? "keys" : "enter-connected",
            signedIn: true,
        };
    return {
        ...startJourney(selection.world),
        deviceEntry:
            selection.world === "device" && selection.section === "link"
                ? "link"
                : "main",
    };
}

/** Restore navigation without rolling back the shared account session or wallet. */
export function restoreJourney(
    saved: JourneyState,
    current: JourneyState,
): JourneyState {
    let next = {
        ...saved,
        signedIn: current.signedIn,
        method: current.method,
        paid: current.paid,
        quest: current.quest,
    };
    if (!next.signedIn) {
        next.connected = false;
        if (
            [
                "enter-connected",
                "keys",
                "api-key",
                "app-key",
                "key-edit",
                "key-delete",
                "dashboard-connected",
                "consent",
                "device-code",
                "device-result",
                "device-done",
                "app-connected",
                "account-checkout",
            ].includes(next.node)
        ) {
            const world = next.world === "topup" ? "app" : next.world;
            next = {
                ...next,
                world,
                node:
                    world === "admin"
                        ? "dashboard-sign-in"
                        : startJourney(world).node,
                payment: "idle",
                scenario: "",
                notice: "",
            };
        }
    } else if (next.node === "enter-signed-out") {
        next.node = "enter-connected";
    }
    return next;
}

// Report empty wallets and confirmed paid-model requirements.
export function journeyFunding(state: JourneyState): PollenStatus | undefined {
    return getAccountPollenStatus({
        type: "wallet",
        balances: { paid: state.paid, quest: state.quest },
        requirement: state.paidOnly ? "paid" : "any",
    });
}

export function journeyOptions(
    state: JourneyState,
    settings?: JourneySettings,
): FlowEdge[] {
    const edges =
        state.world === "app"
            ? appLoginEdges
            : state.world === "device"
              ? getDeviceFlow(state.deviceEntry).edges
              : flowEdges;
    if (state.world === "device")
        return edges.filter(
            (edge) =>
                edge.from === state.node &&
                (edge.from !== "login-failed" ||
                    edge.to ===
                        (state.deviceConsentRoute
                            ? "device-signing-in"
                            : "device-session")),
        );
    return edges
        .map((edge) =>
            edge.from === "login-failed" && state.world !== "app"
                ? { ...edge, to: loginRetryNode(state.world) }
                : edge,
        )
        .filter((edge) => {
            if (edge.from !== state.node) return false;
            if (state.world === "app" && state.node === "blocked") {
                if (edge.label === "Try again")
                    return (
                        (!settings || settings.appRequestError === "lookup") &&
                        edge.to ===
                            (state.signedIn
                                ? "app-checking"
                                : "app-sign-in-checking")
                    );
                if (settings && edge.to === "app-connect")
                    return (
                        settings.appReturnPage &&
                        !["app", "lookup", "missing-client"].includes(
                            settings.appRequestError,
                        )
                    );
            }
            if (state.node === "cancelled")
                return (
                    edge.to ===
                    (state.world === "app" && state.method === "oauth"
                        ? "app-callback-error"
                        : "app-connect")
                );
            if (
                state.world === "app" &&
                state.node === "app-connecting" &&
                edge.to !== "app-connection-failed"
            )
                return (
                    edge.to ===
                    (state.method === "oauth"
                        ? "app-callback"
                        : "app-connected")
                );
            if (state.world === "app" && state.node === "app-callback-error")
                return (
                    edge.to ===
                    (state.scenario === "key-check"
                        ? "app-callback"
                        : "loading")
                );
            return true;
        })
        .sort((a, b) => {
            const rank = (edge: FlowEdge) =>
                edge.label.includes("Profile / dashboard")
                    ? 2
                    : edge.alternate
                      ? 1
                      : 0;
            return rank(a) - rank(b);
        });
}

// Routing decisions with known answers are followed immediately. Their edges
// remain visible in Map; the journey stops at the next screen or actual choice.
function resolve(state: JourneyState): JourneyState {
    let next = state;
    for (let i = 0; i < 8; i++) {
        let node = next.node;
        if (node === "session") node = next.signedIn ? "resume" : "sign-in";
        else if (node === "resume")
            node = {
                app: "request-valid",
                device: "device-code",
                account: "enter-connected",
                admin: "admin-session",
                topup: "account-app",
            }[next.world];
        if (node === next.node) return next;
        next = { ...next, node };
    }
    return next;
}

export function journeyStep(state: JourneyState, edge: FlowEdge): JourneyState {
    if (
        !journeyOptions(state).some(
            (option) => option.to === edge.to && option.label === edge.label,
        )
    )
        return state;
    let next: JourneyState = {
        ...state,
        node: edge.to,
        scenario: "",
        notice: "",
    };
    if (edge.to === "app-connect") next.consent = null;
    if (Object.values(loginErrors).some((error) => error.id === edge.to)) {
        next.signedIn = false;
        next.connected = false;
    }
    if (
        Object.values(loginErrors).some((error) => error.id === edge.from) &&
        edge.to === "enter-signed-out"
    )
        next.world = "account";
    if (edge.to === "enter-connected") next.world = "account";
    if (edge.from === "enter-connected" && edge.to === "account-checkout")
        next.payment = "idle";
    if (edge.from === "account-checkout") {
        if (
            edge.label === "Payment confirmed" &&
            state.payment !== "completed" &&
            state.payment !== "canceled"
        ) {
            next.paid += state.checkoutPack;
            next.payment = "completed";
        } else if (edge.label.startsWith("Canceled")) next.payment = "canceled";
        else if (edge.label === "Payment pending") next.payment = "pending";
    }
    if (edge.from === "loading" && edge.to === "resume") next.signedIn = true;
    if (
        state.world === "app" &&
        edge.to === "loading" &&
        edge.from === "github-handoff"
    ) {
        next.signedIn = true;
    }
    if (
        state.world === "app" &&
        edge.to === "app-home" &&
        edge.from !== "consent"
    ) {
        next.world = "account";
        next.node = next.signedIn ? "enter-connected" : "enter-signed-out";
    }
    if (edge.from === "session") next.signedIn = edge.to === "resume";
    if (
        edge.from === "app-callback" &&
        edge.to === "app-callback-error" &&
        state.connected
    )
        next.scenario = "key-check";
    if (edge.from === "app-callback-error" && edge.to === "app-callback")
        next.connected = true;
    if (edge.to === "cancelled") next.denied = true;
    if (
        state.world === "app" &&
        ["app-connect", "app-callback-error"].includes(edge.to)
    )
        next.connected = false;
    if (edge.from === "app-connected" && edge.to === "app-connect") {
        next.connected = false;
        next.notice =
            edge.label === "Disconnect app"
                ? "App disconnected. Pollinations is still signed in."
                : "App connection expired or was revoked. Connect again.";
    }
    if (
        (["enter-connected", "keys"].includes(edge.from) &&
            edge.to === "enter-signed-out") ||
        (edge.from === "dashboard-connected" && edge.to === "dashboard-sign-in")
    )
        next.signedIn = false;
    if (edge.from === edge.to) {
        if (edge.from === "account-checkout")
            next.scenario = edge.label.startsWith("Payment failed")
                ? "checkout-error"
                : "";
        next.notice = edge.label;
    }
    next = resolve(next);
    if (next.node === "app-connected") next.connected = true;
    return next;
}

/** The map keeps every routing node; the player only stops at user-facing UI. */
export function journeyAdvance(
    state: JourneyState,
    edge: FlowEdge,
    settings: JourneySettings = defaultJourneySettings,
): JourneyState {
    if (
        state.world === "app" &&
        state.method === "oauth" &&
        state.node === "app-connect" &&
        edge.to === "loading" &&
        settings.appConnectionError === "start"
    ) {
        const failure = journeyOptions(state).find(
            (option) => option.to === "app-callback-error",
        );
        if (!failure)
            throw new Error("Missing SDK authorization start failure");
        return journeyStep(state, failure);
    }
    if (
        state.world === "app" &&
        edge.to === "loading" &&
        edge.from === "github-handoff" &&
        settings.loginResult !== "ready" &&
        settings.loginResult !== "start"
    ) {
        const failure = journeyOptions(state).find(
            (option) =>
                option.to ===
                loginErrors[settings.loginResult as keyof typeof loginErrors]
                    .id,
        );
        if (!failure)
            throw new Error("Missing Apps Login callback error route");
        return journeyStep(state, failure);
    }
    if (state.world === "device") {
        let next = journeyStep(state, edge);
        if (next === state) return state;
        // Leaving for GitHub remounts Authorize on return. Only the request
        // route survives that round trip, not the unsaved consent choices.
        if (edge.to === "github-handoff") next.consent = null;
        if (edge.from === "device-start")
            next = {
                ...next,
                connected: false,
                denied: false,
                consent: null,
                deviceConsentRoute: false,
                deviceCode:
                    edge.label === "Open link with code" ? "ABCDEFGH" : "",
            };
        if (edge.from === "github-handoff" && edge.to === "device-session") {
            if (
                settings.loginResult !== "ready" &&
                settings.loginResult !== "start"
            )
                return {
                    ...next,
                    signedIn: false,
                    node: loginErrors[settings.loginResult].id,
                };
            next.signedIn = true;
        }
        if (edge.to === "device-checking") next.deviceConsentRoute = true;
        if (edge.to === "device-code") {
            next.deviceConsentRoute = false;
            next.deviceCode = "";
            next.consent = null;
        }
        if (edge.to === "device-denying") next.denied = true;
        if (edge.to === "device-approving") next.denied = false;
        if (edge.to === "device-submit-session") next.signedIn = false;
        if (edge.to === "device-done") next.connected = true;
        return next;
    }
    let next = journeyStep(state, edge);
    if (state.world === "app") {
        if (next.node !== "cancelled") return next;
        const destination =
            next.method === "oauth" ? "app-callback-error" : "app-connect";
        const route = journeyOptions(next).find(
            (option) => option.to === destination,
        );
        if (!route)
            throw new Error(`Missing app cancellation route: ${destination}`);
        return journeyStep(next, route);
    }
    for (let i = 0; i < 12; i++) {
        const destination = {
            "github-session": settings.githubSignedIn
                ? "github-approval"
                : "github-login",
            "github-approval": settings.githubApproved
                ? "loading"
                : "github-authorize",
            loading:
                settings.loginResult !== "ready" &&
                settings.loginResult !== "start"
                    ? loginErrors[settings.loginResult].id
                    : settings.errors
                      ? "error"
                      : "resume",
            "request-valid": settings.errors ? "blocked" : "consent",
            cancelled: "app-connect",
        }[next.node];
        if (!destination) return next;
        const route = journeyOptions(next).find(
            (option) => option.to === destination,
        );
        if (!route)
            throw new Error(
                `Missing journey route: ${next.node} → ${destination}`,
            );
        next = journeyStep(next, route);
    }
    throw new Error("Journey routing did not reach a screen");
}

export function simulateUsage(state: JourneyState): JourneyState {
    if (!state.connected) return { ...state, notice: "Connect the app first." };
    const available = state.paidOnly ? state.paid : state.paid + state.quest;
    const cost = 1;
    if (state.budget < cost)
        return {
            ...state,
            notice: "This request exceeds the remaining app budget.",
        };
    if (available < cost)
        return {
            ...state,
            notice: state.paidOnly
                ? "This model needs 1 Paid Pollen."
                : "This request needs 1 Pollen.",
        };
    const fromQuest = state.paidOnly ? 0 : Math.min(state.quest, cost);
    return {
        ...state,
        quest: state.quest - fromQuest,
        paid: state.paid - (cost - fromQuest),
        budget: state.budget - cost,
        notice: "Simulated usage: 1 Pollen consumed from the account and app budget.",
    };
}
