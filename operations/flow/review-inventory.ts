import type { CanvasScreen } from "./flow-canvas-data";
import { dashboardSections } from "./flow-dashboard";
import { galleryScreensForFlow } from "./flow-gallery-data";
import type { JourneyEntrance, JourneySection } from "./flow-journey-state";
import { loginSituations } from "./review-auth";
import { appLoginReviewCases, type ReviewCase } from "./review-cases";
import {
    appTopupReviewCases,
    dashboardReviewCasesForSection,
} from "./review-dashboard";
import {
    adminReviewCases,
    deviceReviewCasesForSection,
} from "./review-device-admin";

// Screens, Map, Journey and the capture service consume this same inventory.
export const reviewFlows = [
    { flow: "app", section: "main", cases: appLoginReviewCases },
    { flow: "app", section: "topup", cases: appTopupReviewCases },
    ...(["main", "link"] as const).map((section) => ({
        flow: "device",
        section,
        cases: deviceReviewCasesForSection(section),
    })),
    ...dashboardSections.map(({ id: section }) => ({
        flow: "account",
        section,
        cases: dashboardReviewCasesForSection(section),
    })),
    { flow: "admin", section: "main", cases: adminReviewCases },
];

export function reviewCasesForFlow(
    flow: string,
    section: string,
): ReviewCase[] {
    return (
        reviewFlows.find(
            (entry) => entry.flow === flow && entry.section === section,
        )?.cases ?? []
    );
}

export function reviewCaseForScreen(
    cases: ReviewCase[],
    entry: CanvasScreen,
    choices: Record<string, string>,
    family?: string,
): ReviewCase | undefined {
    // Gallery groups by page; Map groups by branch. An exact recipe id may
    // also be a page id, so it must not bypass that page's selected situation.
    const candidates = cases.filter((recipe) =>
        family === undefined
            ? recipe.pageId === entry.id
            : recipe.family === family,
    );
    return (
        candidates.find((recipe) => choices[recipe.pageId] === recipe.id) ??
        candidates[0]
    );
}

export function situationLabel(
    recipe: ReviewCase,
    screen: CanvasScreen,
): string {
    const label = recipe.title.startsWith(`${screen.title} · `)
        ? recipe.title.slice(screen.title.length + 3)
        : (recipe.variant ?? recipe.title);
    const collection = {
        keys: "Keys",
        apps: "Apps",
        models: "Models",
        agents: "Agents",
    }[recipe.pageId];
    if (collection) {
        const labels: Record<string, string> = {
            Populated: `${collection} available`,
            Empty: `No ${collection.toLowerCase()}`,
            Loading: `Loading ${collection.toLowerCase()}`,
            "Load failed": `${collection} unavailable`,
            Hidden: `${collection} unlisted`,
        };
        if (labels[label]) return labels[label];
    }
    const resource =
        /^(key|app|model|agent)-(create|edit|delete|visibility)$/.exec(
            recipe.pageId,
        );
    if (resource) {
        const [, kind, action] = resource;
        const noun = kind[0].toUpperCase() + kind.slice(1);
        if (label === "Ready")
            return action === "create"
                ? `New ${kind} form`
                : action === "edit"
                  ? `Existing ${kind}`
                  : "Confirm deletion";
        if (label === "Failed")
            return `${noun} ${action === "create" ? "creation" : action === "edit" ? "save" : "deletion"} failed`;
        if (label === "Submitting") return `Creating ${kind}`;
        if (label === "Saving") return `Saving ${kind}`;
        if (label === "Deleting") return `Deleting ${kind}`;
        if (label === "Created · copy key")
            return kind === "app" ? "App key created" : "Key created";
        if (label === "Unlist") return `${noun} listed`;
        if (label === "Relist") return `${noun} unlisted`;
    }
    const context = {
        "account-key": "app access",
        "account-wallet": "wallet",
        "enter-connected": "wallet",
        catalog: "models",
        activity: "activity",
        quests: "quests",
    }[recipe.pageId];
    if (context && label === "Loading") return `Loading ${context}`;
    if (context && label === "Load failed")
        return `${context[0].toUpperCase()}${context.slice(1)} unavailable`;
    const labels: Record<string, string> = {
        "Paid available": "Paid Pollen available",
        "Quest only": "Quest Pollen only",
        Empty: "Wallet empty",
        Available: "Allowance available",
        "Edit key": "App access available",
        "Sign in": "Signed out",
        "Starting sign-in": "Sign-in request failed",
        "Starting sign-in failed": "Sign-in request failed",
        "Request failed": "Sign-in request failed",
        "Returning from GitHub": "GitHub sign-in failed",
        "Public publishing": "Can publish",
        "Check unavailable": "Quest check failed",
        Claiming: "Claiming reward",
        "Claim failed": "Reward claim failed",
        "Confirmation required": "Confirm deletion",
        Acknowledged: "Deletion confirmed",
        "Deletion failed": "Account deletion failed",
        "Test failed": "Endpoint test failed",
        "Test succeeded": "Endpoint test passed",
        Deleting: "Deleting account",
        Saving: "Saving app access",
        "Save failed": "Access save failed",
        Saved: "App access saved",
        "Authorization code creation failed": "Handoff failed",
        "Session expired before approval": "Session expired",
        "Connection not completed": "Not connected",
        "Account details unavailable": "Account unavailable",
        "Missing security challenge": "Missing challenge",
        "Invalid security challenge": "Invalid challenge",
        "Unsupported challenge method": "Unsupported method",
        "Unsupported redirect scheme": "Unsupported URL",
        "Discord identity unavailable": "Discord unavailable",
        "Discord connection failed": "Discord link failed",
        "Discord disconnect failed": "Discord unlink failed",
        "Closed without changes": "Changes discarded",
    };
    if (labels[label]) return labels[label];
    if (label.startsWith("Paid required"))
        return label.replace("Paid required", "Paid Pollen required");
    if (["Ready", "Default", screen.title].includes(label)) {
        return (
            {
                "app-connect": "Not connected",
                "sign-in": "Signed out",
                identity: "Signed out",
                loading: "Checking account",
                consent: "Paid Pollen available",
                "device-code": "Awaiting device code",
                account: "Account details",
            }[recipe.pageId] ?? label
        );
    }
    return label;
}

// Starting over restores data and account conditions, but does not replay clicks
// that jump ahead, submit forms, or create credentials. The real UI owns progress.
export function journeyStartCase(
    scope: ReviewScope,
    selected?: ReviewCase,
): ReviewCase {
    const first = reviewCasesForFlow(scope.flow, scope.section)[0];
    if (!first) throw new Error("This journey has no entry screen.");
    return {
        ...first,
        conditions: selected?.conditions ?? first.conditions,
        prepare: selected?.prepare ?? first.prepare,
        requests: selected?.requests,
        action: undefined,
        steps: undefined,
    };
}

// Observe the product's page identifier; never derive navigation from a click.
export function reviewCaseForNode(cases: ReviewCase[], node: string) {
    return (
        cases.find((item) => item.id === node) ??
        cases.find((item) => item.family === node || item.pageId === node) ??
        cases.find((item) => item.query.screen === node) ??
        (node === loginSituations.default.id
            ? cases.find(
                  (item) =>
                      item.action?.type === "sign-in" &&
                      item.action.outcome === "provider-error",
              )
            : undefined)
    );
}

// Resolve the observed product page within the active flow. Shared provider
// handoffs need no capture recipe; their inventory entry is still their identity.
export function reviewPageForNode(
    cases: ReviewCase[],
    inventory: CanvasScreen[],
    node: string,
) {
    const recipe = reviewCaseForNode(cases, node);
    const entry =
        inventory.find((item) => item.id === (recipe?.pageId ?? node)) ??
        (node === "github-handoff"
            ? inventory.find((item) => item.owner === "GitHub")
            : node === "app-connected"
              ? inventory.find((item) => item.id === "account-app")
              : undefined);
    if (!entry) return undefined;
    const selected = recipe ?? cases.find((item) => item.pageId === entry.id);
    return { entry, recipe: selected, node: selected?.family ?? entry.id };
}

export type ReviewScope = { flow: JourneyEntrance; section: JourneySection };

// A real route can leave its entry flow (consent → wallet, lists → sign-in).
// Follow its existing inventory instead of copying that page into every flow.
// Device browser returns retain the original code/link entry path.
export function reviewPageForLocation(
    scope: ReviewScope,
    observed: { node: string; flow?: JourneyEntrance },
    origin?: ReviewScope,
) {
    const scopes = [
        scope,
        ...reviewFlows.filter((entry) => entry.flow === scope.flow),
        ...(origin ? [origin] : []),
        ...reviewFlows,
    ];
    for (const candidate of scopes) {
        if (observed.flow && candidate.flow !== observed.flow) continue;
        const { flow, section } = candidate as ReviewScope;
        const page = reviewPageForNode(
            reviewCasesForFlow(flow, section),
            galleryScreensForFlow(flow, section),
            observed.node,
        );
        if (page) return { ...page, flow, section };
    }
    return undefined;
}
