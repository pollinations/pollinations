import type { PollenStatus } from "@pollinations/ui/wallet";
import { loginErrors } from "@shared/auth/login-errors.ts";
import { getAuthorizePollenBudget } from "../../shared/auth/authorize-config";
import {
    addPollenPlan,
    defaultAddPollenAmount,
} from "./pollen-connect-add-pollen-data";
import { appLoginEdges } from "./pollen-connect-app-login";
import type {
    authorizeFailures,
    modelCatalogStates,
} from "./pollen-connect-canvas-data";
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
    { id: "admin", label: "Admin", node: "identity" },
] as const;
export type JourneyEntrance = (typeof entrances)[number]["id"];
export type JourneyWorld = JourneyEntrance | "topup";
export type JourneySection = "main" | "topup";
export type JourneySelection = {
    world: JourneyEntrance;
    section: JourneySection;
    revision: number;
};
export type JourneyLocation = { world: JourneyWorld; node: string };
export type JourneySettings = {
    githubSignedIn: boolean;
    githubApproved: boolean;
    adminAccess: boolean;
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
    githubSignedIn: true,
    githubApproved: true,
    adminAccess: true,
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
    node: string;
    world: JourneyWorld;
    paid: number;
    quest: number;
    budget: number;
    amount: number;
    method: "oauth" | "direct";
    signedIn: boolean;
    connected: boolean;
    paidOnly: boolean;
    sharesUsage: boolean;
    payment: "idle" | "pending" | "canceled" | "completed";
    purchased: number;
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
export const situations = [
    { label: "Available", paid: 10, quest: 5, budget: 5, paidOnly: false },
    { label: "No Pollen", paid: 0, quest: 0, budget: 5, paidOnly: false },
    { label: "Paid needed", paid: 0, quest: 5, budget: 5, paidOnly: true },
    { label: "Limit reached", paid: 10, quest: 5, budget: 0, paidOnly: false },
    {
        label: "Purchase covered",
        paid: 40,
        quest: 5,
        budget: 5,
        paidOnly: false,
    },
] as const;

export function startJourney(world: JourneyWorld = "app"): JourneyState {
    return {
        node:
            world === "topup"
                ? "app-connected"
                : (entrances.find((entry) => entry.id === world)?.node ??
                  "app-connect"),
        world,
        paid: 10,
        quest: 5,
        budget: 5,
        amount: defaultAddPollenAmount,
        method: "oauth",
        signedIn: world === "topup",
        connected: world === "topup",
        paidOnly: false,
        sharesUsage: true,
        payment: "idle",
        purchased: 0,
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
    // Apps enter through the same connection flow before opening the menu.
    // The Add Pollen action switches to the budget/top-up world after login.
    if (selection.section === "topup" && selection.world === "account")
        return {
            ...startJourney("account"),
            node: "enter-connected",
            signedIn: true,
        };
    return startJourney(selection.world);
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
                "add-pollen-amount",
                "add-pollen-pending",
                "add-pollen-checkout",
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
    if (state.paid + state.quest === 0) return { state: "no-pollen" };
    if (state.paidOnly && state.paid === 0)
        return { state: "paid-required", wallet: "paid" };
    return undefined;
}

export type JourneyCondition =
    | "covered"
    | "shortfall"
    | "partial"
    | "signed-in"
    | "signed-out"
    | "connected"
    | "simple"
    | "available"
    | "empty"
    | "paid"
    | "limit";

/** Branch fixtures describe the world the next screen will encounter. */
export function withJourneyCondition(
    state: JourneyState,
    condition?: JourneyCondition,
): JourneyState {
    if (condition === "covered" && Number.isFinite(state.budget))
        return {
            ...state,
            paid: Math.max(0, state.budget + state.amount - state.quest),
            notice: "",
        };
    if (condition === "partial")
        return {
            ...state,
            paid: Math.min(5, Math.max(0, state.budget + state.amount - 1)),
            quest: 0,
            notice: "",
        };
    if (condition === "shortfall")
        return { ...state, paid: 0, quest: 0, notice: "" };
    if (condition === "signed-in")
        return { ...state, signedIn: true, connected: false };
    if (condition === "signed-out")
        return { ...state, signedIn: false, connected: false };
    if (condition === "connected")
        return { ...state, signedIn: true, connected: true };
    if (condition === "simple")
        return {
            ...state,
            method: "direct",
            signedIn: false,
            connected: false,
        };
    if (!condition || condition === "covered") return state;
    const index = { available: 0, empty: 1, paid: 2, limit: 3 }[condition];
    return index === undefined
        ? state
        : {
              ...state,
              ...situations[index],
              budget: condition === "limit" ? 0 : state.budget,
              notice: "",
          };
}

export function journeyOptions(
    state: JourneyState,
    settings?: JourneySettings,
): FlowEdge[] {
    return (state.world === "app" ? appLoginEdges : flowEdges)
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
            if (["github-authorize", "loading"].includes(state.node)) {
                if (state.world === "topup" && edge.to === "error")
                    return false;
                if (state.world !== "topup" && edge.to === "add-pollen-failed")
                    return false;
            }
            if (state.node === "cancelled")
                return (
                    edge.to ===
                    (state.world === "device"
                        ? "device-result"
                        : state.world === "app" && state.method === "oauth"
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
            if (state.node === "device-result")
                return (
                    edge.to ===
                    (state.denied ? "device-stopped" : "device-done")
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

function finishTopUp(state: JourneyState, payment: boolean): JourneyState {
    if (state.payment === "completed" || state.payment === "canceled")
        return state;
    const plan = addPollenPlan(
        state.paid + state.quest,
        state.budget,
        state.amount,
    );
    if (payment && state.checkoutPack <= 0)
        return {
            ...state,
            node: "add-pollen-failed",
            notice: "No available pack covers the shortfall.",
        };
    const purchased = payment ? state.checkoutPack : 0;
    return {
        ...state,
        paid: state.paid + purchased,
        budget: payment ? state.budget : plan.resultingBudget,
        purchased,
        payment: "completed",
        node: payment ? "add-pollen-amount" : "app-connected",
        notice: purchased
            ? `${purchased} pollen added to your account. App budget unchanged.`
            : "Budget saved. No Pollen spent or transferred.",
    };
}

// Routing decisions with known answers are followed immediately. Their edges
// remain visible in Map; the journey stops at the next screen or actual choice.
function resolve(state: JourneyState): JourneyState {
    let next = state;
    for (let i = 0; i < 8; i++) {
        let node = next.node;
        if (node === "add-pollen-unchanged") node = "app-connected";
        if (node === "session") node = next.signedIn ? "resume" : "sign-in";
        else if (node === "resume")
            node = {
                app: "request-valid",
                device: "device-code",
                account: "enter-connected",
                admin: "admin",
                topup: "add-pollen-amount",
            }[next.world];
        else if (node === "add-pollen-covered") {
            const plan = addPollenPlan(
                next.paid + next.quest,
                next.budget,
                next.amount,
                next.checkoutPack,
            );
            if (plan.shortfall === 0) return finishTopUp(next, false);
            node = plan.pack ? "add-pollen-checkout" : "add-pollen-failed";
            next = {
                ...next,
                payment: "pending",
                checkoutPack: plan.pack?.amountUsd ?? 0,
            };
        } else if (node === "add-pollen-credited")
            return finishTopUp(next, true);
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
    if (edge.from === "add-pollen-amount" && edge.to === "add-pollen-covered")
        next.payment = "idle";
    if (edge.from === "add-pollen-amount" && edge.to === "add-pollen-checkout")
        next.payment = "pending";
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
    if (edge.from === "consent" && edge.to === "device-result") {
        next.connected = true;
        next.denied = false;
    }
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
    if (edge.from === "app-connected" && edge.to === "add-pollen-amount") {
        next.world = "topup";
        next.payment = "idle";
        next.amount = defaultAddPollenAmount;
        next.purchased = 0;
        next.checkoutPack = 0;
        if (!next.signedIn) next.node = "github-session";
    }
    if (edge.from === "add-pollen-amount" && edge.to === "github-session")
        next.signedIn = false;
    if (edge.from === "add-pollen-checkout" && edge.label.includes("canceled"))
        next.payment = "canceled";
    if (edge.to === "add-pollen-unchanged")
        next.notice = "Budget unchanged. Your app connection is still active.";
    if (edge.from === edge.to) {
        next.scenario =
            {
                "add-pollen-amount": "start-error",
                "add-pollen-pending": "pending",
                "add-pollen-checkout": "checkout-error",
            }[edge.from] ?? "";
        if (edge.from === "account-checkout")
            next.scenario = edge.label.startsWith("Payment failed")
                ? "checkout-error"
                : "";
        next.notice = edge.label;
    }
    if (edge.from === "code-valid" && edge.to === "device-code")
        next.scenario = "device-invalid";
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
    if (
        settings.errors &&
        edge.from === "add-pollen-pending" &&
        edge.to === edge.from
    )
        next = { ...next, scenario: "status-error" };
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
                      ? next.world === "topup"
                          ? "add-pollen-failed"
                          : "error"
                      : "resume",
            "request-valid": settings.errors ? "blocked" : "consent",
            "code-valid": settings.errors ? "device-code" : "request-valid",
            admin:
                settings.adminAccess && !settings.errors
                    ? "dashboard-connected"
                    : "dashboard-denied",
            cancelled:
                next.world === "device" ? "device-result" : "app-connect",
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
