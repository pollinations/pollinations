import { getAuthorizeRequestError } from "@shared/auth/authorize-config.ts";
import { loginErrors } from "@shared/auth/login-errors.ts";
import { getDefaultErrorMessage } from "../../shared/error.ts";
import type { Conditions } from "./live-client";
import {
    type CanvasScreen,
    type ScreenVariant,
    screenVariant,
} from "./pollen-connect-canvas-data";
import { galleryScreensForFlow } from "./pollen-connect-gallery-data";
import { consentExpected } from "./review-consent";
import type { ReviewStep } from "./review-driver";
import { fundingReview, fundingSituations } from "./review-funding";
import type { ReviewRequest } from "./review-requests";
import type { ReviewSetup } from "./review-setup";
import { screenRoute } from "./screen-route";

export type ReviewCase = {
    id: string;
    pageId: string;
    family: string;
    title: string;
    variant?: string;
    provider?: "GitHub" | "Stripe";
    query: Record<string, string>;
    finalRoute?: string;
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
    };
}

// These public identifiers are used only to compute front-door validation copy.
// Captures resolve the same query against the real isolated account's identity.
const validationIdentity = {
    connection: {
        clientId: "pk_review_validation",
        keyId: null,
        allowance: null,
        enabled: false,
    },
    admin: { clientId: "pk_review_validation_admin", registered: false },
    device: null,
};
function requestErrorText(query: Record<string, string>) {
    const target = screenRoute(
        new URLSearchParams(query),
        validationIdentity,
        "http://localhost:4180",
    );
    if (!target) throw new Error("Missing authorization review route");
    const params = new URL(target, "http://localhost:4180").searchParams;
    const read = (key: string) => params.get(key) ?? undefined;
    return getAuthorizeRequestError({
        redirectUrl: read("redirect_uri"),
        appKey: read("client_id"),
        responseType: read("response_type"),
        codeChallenge: read("code_challenge"),
        codeChallengeMethod: read("code_challenge_method"),
    });
}

// Every case starts with fresh browser storage and an isolated account baseline.
// Only the recipe's explicit conditions differ from the selected shared baseline.
export const appLoginReviewCases: ReviewCase[] = [
    reviewCase("app-connect", {}, "app-connect", "app-connect", {
        conditions: { account: "signed-out" },
        expected: [{ selector: '[data-connect-state="signed-out"] button' }],
    }),
    reviewCase("sign-in", {}, "sign-in", "sign-in", {
        conditions: { account: "signed-out" },
        expected: [
            { selector: "#sign-in-title" },
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
            { selector: 'button[aria-busy="false"]:has-text("Allow access")' },
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
                            'button[aria-busy="false"]:has-text("Allow access")',
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
                { selector: "button[aria-busy='true']", text: "Checking app" },
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
                    selector: "button[aria-busy='true']",
                    text: "Checking account",
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
            expected: [
                { selector: "#connection-error-title" },
                {
                    selector: "[role='alert']",
                    text: "Could not verify this app key",
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
                "button[aria-busy='true']",
                "Checking app",
            ],
            [
                { model_catalog: "loading" },
                "consent-models-loading",
                "/gen/models",
                "pending",
                "output",
                "Loading models",
            ],
            [
                { model_catalog: "error" },
                "consent-models-error",
                "/gen/models",
                "unavailable",
                "p",
                "Couldn’t load models",
            ],
        ] as const
    ).map(([params, id, path, outcome, selector, text]) =>
        reviewCase("consent", { params }, id, "consent", {
            query: { screen: "oauth" },
            conditions: { account: "signed-in" },
            requests: [{ path, outcome }],
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
                { selector: "button[aria-busy='true']", text: "Connecting" },
            ],
        },
    ),
    ...Object.values(loginErrors).map((error) =>
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
                        error.id === loginErrors.default.id
                            ? "oauth-signed-out"
                            : error.id,
                },
                ...(error.id === loginErrors.default.id && {
                    finalRoute: "/authorize",
                    action: {
                        type: "sign-in" as const,
                        outcome: "provider-error" as const,
                    },
                }),
                conditions: {
                    account:
                        error.code === loginErrors.banned.code
                            ? "banned"
                            : "signed-out",
                },
                expected: [
                    { selector: "#sign-in-title", text: error.title },
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
        const validation = requestErrorText(query);
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
                        { selector: "#connection-error-title" },
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
                              { selector: "#sign-in-title" },
                              {
                                  selector: 'button[aria-busy="true"]',
                                  text: "Signing in",
                              },
                          ]
                        : [
                              {
                                  selector: "#sign-in-title",
                                  text: loginErrors.default.title,
                              },
                              {
                                  selector: '[role="alert"]',
                                  text: loginErrors.default.message,
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
                  : situation === "account-error"
                    ? "app-account-error"
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
                        text: "Connect with Pollinations",
                        action: "click",
                    },
                    ...(situation === "limit-reached"
                        ? [
                              {
                                  selector: "input[type='number']",
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
                        selector: `[data-connect-state='${situation === "limit-reached" ? "connected" : situation}']`,
                    },
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
            conditions: { account: "signed-in" },
            query: { screen: "add-pollen-connect" },
            steps: [
                {
                    selector: "button",
                    text: "Connect with Pollinations",
                    action: "click",
                },
                {
                    selector: "button",
                    text: "Back to app",
                    action: "click",
                },
            ],
            expected: [
                { selector: '[data-connect-state="connection-error"]' },
                {
                    selector: '[role="alert"]',
                    text: "Connection was not completed. Please try again.",
                },
                {
                    selector:
                        'button:enabled:has(span:text-is("Connect with Pollinations"))',
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
                        selector:
                            'button:not(:disabled):text-is("Back to app")',
                    },
                ],
            },
        ),
    ),
    reviewCase(
        "sign-in-errors",
        {
            params: {
                action: "sign-in",
                result: "error",
                authorize_error: "session",
            },
        },
        "consent-session-expired",
        "error",
        {
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
                    text: "Your pollinations.ai session expired. Sign in again to continue.",
                },
                { selector: "button", text: "Sign in again" },
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
