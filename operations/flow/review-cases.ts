import { getDefaultErrorMessage } from "../../shared/error.ts";
import {
    type CanvasScreen,
    type ScreenVariant,
    screenVariant,
} from "./flow-canvas-data";
import { galleryScreensForFlow } from "./flow-gallery-data";
import type { Conditions } from "./live-client";
import { loginSituations } from "./review-auth";
import { consentExpected } from "./review-consent";
import type { ReviewStep } from "./review-driver";
import { fundingReview, fundingSituations } from "./review-funding";
import type { ReviewRequest } from "./review-requests";
import type { ReviewSetup } from "./review-setup";

export type ReviewCase = {
    id: string;
    pageId: string;
    family: string;
    title: string;
    variant?: string;
    provider?: "GitHub" | "Stripe";
    query: Record<string, string>;
    finalRoute?: string;
    note?: string;
    conditions: Partial<Conditions>;
    requests?: ReviewRequest[];
    steps?: ReviewStep[];
    prepare?: ReviewSetup;
    // Match text by containment: the real alert may also include recovery copy.
    expected: { selector: string; text?: string }[];
    action?:
        | {
              type: "sign-in";
              outcome: "pending" | "error" | "provider-error";
          }
        | { type: "device-deny" };
};

const inventory = galleryScreensForFlow("app", "main");
function page(id: string) {
    const entry = inventory.find((entry) => entry.id === id);
    if (!entry) throw new Error(`Missing App Login page: ${id}`);
    return entry;
}
function caseTitle(entry: CanvasScreen, variant?: ScreenVariant) {
    const label = variant?.label;
    return !label || ["Ready", "Default", entry.title].includes(label)
        ? entry.title
        : `${entry.title} · ${label}`;
}
function reviewCase(
    pageId: string,
    selection: Pick<ScreenVariant, "screen" | "params">,
    id: string,
    family: string,
    recipe: Pick<
        ReviewCase,
        | "conditions"
        | "expected"
        | "action"
        | "requests"
        | "steps"
        | "prepare"
        | "provider"
        | "finalRoute"
        | "note"
    > & {
        query?: Record<string, string>;
        title?: string;
    },
): ReviewCase {
    const entry = page(pageId);
    const variant = screenVariant(entry, selection);
    const screen = recipe.query?.screen ?? variant?.screen ?? entry.screen;
    if (!screen) throw new Error(`Missing App Login route: ${id}`);
    return {
        id,
        pageId,
        family,
        variant: variant?.label ?? entry.title,
        title: recipe.title ?? caseTitle(entry, variant),
        query: recipe.query ?? { screen, ...variant?.params },
        conditions: recipe.conditions,
        expected: recipe.expected,
        ...(recipe.requests && { requests: recipe.requests }),
        ...(recipe.steps && { steps: recipe.steps }),
        ...(recipe.prepare && { prepare: recipe.prepare }),
        ...(recipe.action && { action: recipe.action }),
        ...(recipe.provider && { provider: recipe.provider }),
        ...(recipe.finalRoute && { finalRoute: recipe.finalRoute }),
        ...(recipe.note && { note: recipe.note }),
    };
}

// Expected fragments for invalid requests. Enter still validates and renders them;
// these assertions do not calculate or supply the product's error response.
const requestErrorText: Record<string, string> = {
    "missing-redirect": "No redirect URL provided",
    "invalid-redirect": "Invalid redirect URL format",
    "redirect-scheme": "not registered for this app",
    "response-type": "Unsupported response_type",
    "missing-client": "client_id is required",
    "missing-challenge": "PKCE code_challenge is required",
    "challenge-method": "code_challenge_method=S256 is required",
    "invalid-challenge": "code_challenge must be a 43-character",
};

// Every case starts with fresh browser storage and an isolated account baseline.
// Only the recipe's explicit conditions differ from the selected shared baseline.
export const appLoginReviewCases: ReviewCase[] = [
    reviewCase("app-connect", {}, "app-connect", "app-connect", {
        conditions: { account: "signed-out" },
        expected: [{ selector: '[data-flow-state="signed-out"] button' }],
    }),
    reviewCase("sign-in", {}, "sign-in", "sign-in", {
        conditions: { account: "signed-out" },
        expected: [
            { selector: "h1" },
            {
                selector:
                    'button:not([disabled]):has-text("Sign in with GitHub")',
            },
        ],
    }),
    reviewCase("consent", {}, "consent", "consent", {
        conditions: { account: "signed-in" },
        expected: [
            ...consentExpected("app"),
            { selector: 'button:not([disabled]):has-text("Allow access")' },
        ],
    }),
    ...fundingSituations.map((situation) => {
        const funding = fundingReview(situation);
        return reviewCase(
            "consent",
            { params: { funding: situation.id } },
            `consent-${situation.id}`,
            "consent",
            {
                ...funding,
                query: { screen: "oauth" },
                expected: [
                    ...funding.expected,
                    ...consentExpected("app"),
                    {
                        selector:
                            'button:not([disabled]):has-text("Allow access")',
                    },
                ],
            },
        );
    }),
    reviewCase(
        "sign-in",
        { params: { app_loading: "1" } },
        "app-checking",
        "sign-in",
        {
            query: { screen: "oauth-signed-out" },
            conditions: { account: "signed-out" },
            requests: [{ path: "/api/app-lookup", outcome: "pending" }],
            expected: [
                {
                    selector:
                        'button:not([disabled]):has-text("Sign in with GitHub")',
                },
            ],
        },
    ),
    reviewCase(
        "loading",
        { params: { session: "loading" } },
        "loading",
        "loading",
        {
            query: { screen: "oauth" },
            conditions: { account: "signed-in" },
            requests: [{ path: "/api/auth/get-session", outcome: "pending" }],
            expected: [
                {
                    selector: "output",
                    text: "Loading…",
                },
            ],
        },
    ),
    reviewCase(
        "connection-link-errors",
        { params: { request_error: "lookup" } },
        "blocked-lookup",
        "blocked",
        {
            query: {
                screen: "oauth-request-signed-out",
                request_error: "lookup",
            },
            conditions: { account: "signed-out" },
            requests: [{ path: "/api/app-lookup", outcome: "unavailable" }],
            note: "Main renders an unverified-app error for this HTTP 503. It does not distinguish a lookup outage from an unknown app (G01).",
            expected: [
                { selector: "h1" },
                {
                    selector: "[role='alert']",
                    text: "This app key could not be verified",
                },
            ],
        },
    ),
    ...(
        [
            [
                { app_loading: "1" },
                "consent-checking",
                "/api/app-lookup",
                "pending",
                'button[disabled]:has-text("Allow access")',
                "Allow access",
            ],
            [
                { model_catalog: "loading" },
                "consent-models-loading",
                "/gen/models",
                "pending",
                '#authorize-permissions button[aria-label="Choose models"]',
                "",
            ],
            [
                { model_catalog: "error" },
                "consent-models-error",
                "/gen/models",
                "unavailable",
                '#authorize-permissions button[aria-label="Choose models"]',
                "",
            ],
        ] as const
    ).map(([params, id, path, outcome, selector, text]) =>
        reviewCase("consent", { params }, id, "consent", {
            query: { screen: "oauth" },
            conditions: { account: "signed-in" },
            requests: [{ path, outcome }],
            ...(id !== "consent-checking" && {
                note: "Main does not show a model-catalog loading or error message. The picker remains available with an empty public catalog; this is a product gap.",
            }),
            expected: [
                ...consentExpected("app", id === "consent-checking"),
                { selector, text },
            ],
        }),
    ),
    reviewCase(
        "consent",
        { params: { action: "authorize", result: "waiting" } },
        "consent-connecting",
        "app-connecting",
        {
            query: { screen: "oauth" },
            conditions: { account: "signed-in" },
            requests: [
                { path: "/api/api-keys", method: "POST", outcome: "pending" },
            ],
            steps: [
                { selector: "button", text: "Allow access", action: "click" },
            ],
            expected: [
                ...consentExpected("app"),
                { selector: "button[disabled]", text: "Connecting…" },
            ],
        },
    ),
    ...Object.values(loginSituations).map((error) =>
        reviewCase(
            error.id,
            {
                params: {
                    login_error: error.code,
                    ...(error.id === "login-failed" && { login_flow: "app" }),
                },
            },
            error.id,
            error.id,
            {
                title: error.title,
                query: {
                    screen:
                        error.id === loginSituations.default.id
                            ? "oauth-signed-out"
                            : error.id,
                },
                ...(error.id === loginSituations.default.id && {
                    finalRoute: "/error",
                    action: {
                        type: "sign-in" as const,
                        outcome: "provider-error" as const,
                    },
                }),
                conditions: {
                    account:
                        error.code === loginSituations.banned.code
                            ? "banned"
                            : "signed-out",
                },
                expected: [
                    { selector: "h1", text: "Sign in" },
                    { selector: '[role="alert"]', text: error.message },
                ],
            },
        ),
    ),
    ...(page("connection-link-errors").variants ?? []).flatMap((variant) => {
        const reason = variant.params?.request_error;
        if (!reason || reason === "lookup") return [];
        const query = {
            screen: "oauth-request-signed-out",
            request_error: reason,
        };
        const validation = requestErrorText[reason];
        // Lookup copy currently lives inside the production controller. Match
        // a distinguishing fragment without creating another copy catalog.
        const text =
            validation ??
            (reason === "redirect"
                ? "not registered for this app"
                : reason === "app"
                  ? "app key could not be verified"
                  : null);
        if (!text) throw new Error(`Unsupported request recipe: ${reason}`);
        return [
            reviewCase(
                "connection-link-errors",
                variant,
                `blocked-${reason}`,
                "blocked",
                {
                    query,
                    conditions: { account: "signed-out" },
                    expected: [
                        { selector: "h1" },
                        { selector: '[role="alert"]', text },
                    ],
                },
            ),
        ];
    }),
    ...(["pending", "error"] as const).map((outcome) => {
        const pageId = outcome === "pending" ? "sign-in" : "sign-in-errors";
        const id = outcome === "pending" ? "app-signing-in" : "error";
        return reviewCase(
            pageId,
            {
                params: {
                    action: "sign-in",
                    result: outcome === "pending" ? "waiting" : "error",
                },
            },
            id,
            id,
            {
                query: { screen: "oauth-signed-out" },
                conditions: { account: "signed-out" },
                action: { type: "sign-in", outcome },
                expected:
                    outcome === "pending"
                        ? [
                              { selector: "h1" },
                              {
                                  selector: 'button[aria-busy="true"]',
                                  text: "Signing in",
                              },
                          ]
                        : [
                              {
                                  selector: "h1",
                                  text: "Allow this app",
                              },
                              {
                                  selector: '[role="alert"]',
                                  text: "We couldn’t sign you in to your Pollinations account. Please try again.",
                              },
                          ],
            },
        );
    }),
    ...(
        [
            ["connected", {}],
            [
                "checking-connection",
                {
                    screen: "add-pollen-connect",
                    params: { app_callback: "waiting" },
                },
            ],
            [
                "connection-error",
                {
                    screen: "add-pollen-connect",
                    params: { app_callback: "error" },
                },
            ],
            ["loading-account", { params: { app_account: "loading" } }],
            ["account-error", { params: { app_account: "account-error" } }],
            ["limit-reached", { params: { sim_budget: "0" } }],
        ] as const
    ).map(([situation, selection]) =>
        reviewCase(
            "app-connected",
            selection,
            `app-${situation}`,
            situation === "checking-connection"
                ? "app-callback"
                : situation === "connection-error"
                  ? "app-callback-error"
                  : "app-connected",
            {
                conditions: {
                    account: "signed-in",
                    allowance:
                        situation === "limit-reached"
                            ? "exhausted"
                            : "available",
                },
                query: { screen: "add-pollen-connect" },
                ...((situation === "loading-account" ||
                    situation === "account-error") && {
                    note: "Main keeps the SDK connected and shows Connected user while the profile is pending or unavailable. The app menu has no profile-error message or retry control.",
                }),
                requests:
                    situation === "checking-connection" ||
                    situation === "connection-error"
                        ? [
                              {
                                  path: "/api/oauth/token",
                                  method: "POST",
                                  outcome:
                                      situation === "checking-connection"
                                          ? "pending"
                                          : "server-error",
                              },
                          ]
                        : situation === "loading-account" ||
                            situation === "account-error"
                          ? [
                                {
                                    path: "/gen/account/profile",
                                    outcome:
                                        situation === "loading-account"
                                            ? "pending"
                                            : "unavailable",
                                },
                            ]
                          : [],
                steps: [
                    {
                        selector: "button",
                        text: "Pollinations Connect",
                        action: "click",
                    },
                    ...(situation === "limit-reached"
                        ? [
                              {
                                  selector: "input[name='pollen-budget']",
                                  action: "fill" as const,
                                  value: "0",
                              },
                          ]
                        : []),
                    {
                        selector: "button",
                        text: "Allow access",
                        action: "click",
                    },
                ],
                expected: [
                    {
                        selector: `[data-flow-state='${["limit-reached", "loading-account", "account-error"].includes(situation) ? "connected" : situation}']`,
                    },
                    ...(["loading-account", "account-error"].includes(situation)
                        ? [
                              {
                                  selector:
                                      'button[aria-label="App account menu"]',
                                  text: "Connected user",
                              },
                              {
                                  selector:
                                      'body:not(:has([role="alert"])):not(:has(button:text-is("Try again")))',
                              },
                          ]
                        : []),
                    ...(situation === "limit-reached"
                        ? [{ selector: "button, span", text: "Limit reached" }]
                        : []),
                ],
            },
        ),
    ),
    reviewCase(
        "app-connected",
        {
            screen: "add-pollen-connect",
            params: { app_callback: "denied" },
        },
        "app-access-declined",
        "app-callback-error",
        {
            note: "After declined access, the SDK reports the callback error. Main’s app menu renders the Connect button without an inline error message.",
            conditions: { account: "signed-in" },
            query: { screen: "add-pollen-connect" },
            steps: [
                {
                    selector: "button",
                    text: "Pollinations Connect",
                    action: "click",
                },
                {
                    selector: "button",
                    text: "Decline",
                    action: "click",
                },
            ],
            expected: [
                { selector: '[data-flow-state="connection-error"]' },
                {
                    selector: 'button:enabled:has-text("Pollinations Connect")',
                },
            ],
        },
    ),
    ...(["key", "code"] as const).map((kind) =>
        reviewCase(
            "consent-errors",
            {
                params: {
                    action: "authorize",
                    result: "error",
                    authorize_error: kind,
                },
            },
            `consent-failed-${kind}`,
            "app-connection-failed",
            {
                conditions: { account: "signed-in" },
                query: { screen: "oauth" },
                requests: [
                    {
                        path:
                            kind === "key"
                                ? "/api/api-keys"
                                : "/api/oauth/code",
                        method: "POST",
                        outcome: "server-error",
                    },
                ],
                steps: [
                    {
                        selector: "button",
                        text: "Allow access",
                        action: "click",
                    },
                ],
                expected: [
                    {
                        selector: "[role='alert']",
                        text: getDefaultErrorMessage(500),
                    },
                    {
                        selector: 'button:not(:disabled):text-is("Go back")',
                    },
                ],
            },
        ),
    ),
    reviewCase(
        "consent-errors",
        {
            params: {
                action: "authorize",
                result: "error",
                authorize_error: "session",
            },
        },
        "consent-session-expired",
        "app-connection-failed",
        {
            note: "Injected HTTP 401: main shows the returned message and Go back. It does not offer sign-in recovery here (G02).",
            conditions: { account: "signed-in" },
            query: { screen: "oauth" },
            requests: [
                {
                    path: "/api/api-keys",
                    method: "POST",
                    outcome: "unauthorized",
                },
            ],
            steps: [
                {
                    selector: "button",
                    text: "Allow access",
                    action: "click",
                },
            ],
            expected: [
                {
                    selector: "[role='alert']",
                    text: getDefaultErrorMessage(401),
                },
                { selector: "button", text: "Go back" },
            ],
        },
    ),
    reviewCase("github-handoff", {}, "github-handoff", "github-handoff", {
        provider: "GitHub",
        query: { screen: "github" },
        title: "Continue on GitHub · external reference",
        conditions: {},
        expected: [{ selector: "h1, h2", text: "Continue on GitHub" }],
    }),
];
