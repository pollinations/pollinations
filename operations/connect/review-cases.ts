import { getAuthorizeRequestError } from "@shared/auth/authorize-config.ts";
import { loginErrors } from "@shared/auth/login-errors.ts";
import type { Conditions } from "./live-client";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import { galleryScreensForFlow } from "./pollen-connect-gallery-data";
import type { ReviewStep } from "./review-driver";
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

export type UnsupportedReviewCase = {
    id: string;
    pageId: string;
    title: string;
    reason: string;
};

const inventory = galleryScreensForFlow("app", "main");
const covered = new Set<string>();
function page(id: string) {
    const entry = inventory.find((entry) => entry.id === id);
    if (!entry) throw new Error(`Missing App Login page: ${id}`);
    return entry;
}
function caseTitle(entry: CanvasScreen, index: number) {
    const label = entry.variants?.[index]?.label;
    return !label || ["Ready", "Default", entry.title].includes(label)
        ? entry.title
        : `${entry.title} · ${label}`;
}
function reviewCase(
    pageId: string,
    index: number,
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
    > & {
        query?: Record<string, string>;
        title?: string;
    },
): ReviewCase {
    const entry = page(pageId);
    const variant = entry.variants?.[index];
    const screen = recipe.query?.screen ?? variant?.screen ?? entry.screen;
    if (!screen) throw new Error(`Missing App Login route: ${id}`);
    covered.add(`${pageId}:${index}`);
    return {
        id,
        pageId,
        family,
        title: recipe.title ?? caseTitle(entry, index),
        query: recipe.query ?? { screen, ...variant?.params },
        conditions: recipe.conditions,
        expected: recipe.expected,
        ...(recipe.requests && { requests: recipe.requests }),
        ...(recipe.steps && { steps: recipe.steps }),
        ...(recipe.prepare && { prepare: recipe.prepare }),
        ...(recipe.action && { action: recipe.action }),
        ...(recipe.provider && { provider: recipe.provider }),
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
    reviewCase("app-connect", 0, "app-connect", "app-connect", {
        conditions: { account: "signed-out" },
        expected: [{ selector: '[data-connect-state="signed-out"] button' }],
    }),
    reviewCase("sign-in", 0, "sign-in", "sign-in", {
        conditions: { account: "signed-out" },
        expected: [
            { selector: "#sign-in-title" },
            {
                selector:
                    'button:not([disabled]):has-text("Sign in with GitHub")',
            },
        ],
    }),
    reviewCase("consent", 0, "consent", "consent", {
        conditions: { account: "signed-in" },
        expected: [
            { selector: "#authorize-dialog-title" },
            { selector: 'button[aria-busy="false"]:has-text("Allow access")' },
        ],
    }),
    reviewCase("sign-in", 1, "app-checking", "sign-in", {
        query: { screen: "oauth-signed-out" },
        conditions: { account: "signed-out" },
        requests: [{ path: "/api/app-lookup", outcome: "pending" }],
        expected: [
            { selector: "button[aria-busy='true']", text: "Checking app" },
        ],
    }),
    reviewCase("loading", 0, "loading", "loading", {
        query: { screen: "oauth" },
        conditions: { account: "signed-in" },
        requests: [{ path: "/api/auth/get-session", outcome: "pending" }],
        expected: [
            { selector: "button[aria-busy='true']", text: "Checking account" },
        ],
    }),
    reviewCase(
        "connection-link-errors",
        (page("connection-link-errors").variants ?? []).findIndex(
            (v) => v.params?.request_error === "lookup",
        ),
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
                1,
                "consent-checking",
                "/api/app-lookup",
                "pending",
                "button[aria-busy='true']",
                "Checking app",
            ],
            [
                2,
                "consent-models-loading",
                "/gen/models",
                "pending",
                "output",
                "Loading models",
            ],
            [
                3,
                "consent-models-error",
                "/gen/models",
                "unavailable",
                "p",
                "Couldn’t load models",
            ],
        ] as const
    ).map(([index, id, path, outcome, selector, text]) =>
        reviewCase("consent", index, id, "consent", {
            query: { screen: "oauth" },
            conditions: { account: "signed-in" },
            requests: [{ path, outcome }],
            expected: [
                { selector: "#authorize-dialog-title" },
                { selector, text },
            ],
        }),
    ),
    reviewCase("consent", 4, "consent-connecting", "app-connecting", {
        query: { screen: "oauth" },
        conditions: { account: "signed-in" },
        requests: [
            { path: "/api/api-keys", method: "POST", outcome: "pending" },
        ],
        steps: [{ selector: "button", text: "Allow access", action: "click" }],
        expected: [
            { selector: "button[aria-busy='true']", text: "Connecting" },
        ],
    }),
    ...Object.values(loginErrors).map((error) =>
        reviewCase(error.id, 0, error.id, error.id, {
            title: error.title,
            query: {
                screen:
                    error.id === loginErrors.default.id
                        ? "oauth-signed-out"
                        : error.id,
            },
            ...(error.id === loginErrors.default.id && {
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
        }),
    ),
    ...(page("connection-link-errors").variants ?? []).flatMap(
        (variant, index) => {
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
                    index,
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
        },
    ),
    ...(["pending", "error"] as const).map((outcome) => {
        const pageId = outcome === "pending" ? "sign-in" : "sign-in-errors";
        const index = page(pageId).variants?.findIndex(
            (variant) =>
                variant.params?.action === "sign-in" &&
                variant.params.result ===
                    (outcome === "pending" ? "waiting" : "error"),
        );
        if (index === undefined || index < 0)
            throw new Error(`Missing sign-in ${outcome} state`);
        const id = outcome === "pending" ? "app-signing-in" : "error";
        return reviewCase(pageId, index, id, id, {
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
        });
    }),
    ...(
        [
            "connected",
            "checking-connection",
            "connection-error",
            "connection-check-error",
            "loading-account",
            "account-error",
            "connected",
        ] as const
    ).map((state, index) =>
        reviewCase(
            "app-connected",
            index,
            `app-connected-${index}`,
            index === 1
                ? "app-callback"
                : index === 2 || index === 3
                  ? "app-callback-error"
                  : index === 5
                    ? "app-account-error"
                    : "app-connected",
            {
                conditions: {
                    account: "signed-in",
                    allowance: index === 6 ? "exhausted" : "available",
                },
                query: { screen: "add-pollen-connect" },
                requests:
                    index === 1 || index === 2
                        ? [
                              {
                                  path: "/api/oauth/token",
                                  method: "POST",
                                  outcome:
                                      index === 1 ? "pending" : "unavailable",
                              },
                          ]
                        : index === 4 || index === 5
                          ? [
                                {
                                    path: "/gen/account/profile",
                                    outcome:
                                        index === 4 ? "pending" : "unavailable",
                                },
                            ]
                          : [],
                steps: [
                    {
                        selector: "button",
                        text: "Connect with Pollinations",
                        action: "click",
                    },
                    ...(index === 6
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
                    ...(index === 3
                        ? [
                              {
                                  selector: "[data-connect-state='connected']",
                                  action: "requests" as const,
                                  requests: [
                                      {
                                          path: "/gen/account/key",
                                          outcome: "unavailable" as const,
                                      },
                                  ],
                              },
                              { selector: "html", action: "reload" as const },
                          ]
                        : []),
                ],
                expected: [
                    { selector: `[data-connect-state='${state}']` },
                    ...(index === 6
                        ? [{ selector: "button, span", text: "Limit reached" }]
                        : []),
                ],
            },
        ),
    ),
    ...(["key", "code"] as const).map((kind, index) =>
        reviewCase(
            "consent-errors",
            index + 2,
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
                        outcome: "unavailable",
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
                        text: "We're temporarily down for maintenance. Sorry about that!",
                    },
                ],
            },
        ),
    ),
    ...(["forbidden", "unauthorized"] as const).map((outcome, index) =>
        reviewCase(
            "consent-errors",
            index,
            `consent-rejected-${index}`,
            "app-connection-failed",
            {
                conditions: { account: "signed-in" },
                query: { screen: "oauth" },
                requests: [{ path: "/api/api-keys", method: "POST", outcome }],
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
                        text:
                            outcome === "unauthorized"
                                ? "Authentication required."
                                : "Access denied!",
                    },
                ],
            },
        ),
    ),
    reviewCase("github-handoff", 0, "github-handoff", "github-handoff", {
        provider: "GitHub",
        query: { screen: "github" },
        title: "Continue on GitHub · external reference",
        conditions: {},
        expected: [{ selector: "h1, h2", text: "Continue on GitHub" }],
    }),
];

export const unsupportedAppLoginReviewCases: UnsupportedReviewCase[] =
    inventory.flatMap((entry) =>
        (entry.variants ?? [{ label: entry.title }]).flatMap(
            (variant, index) => {
                if (covered.has(`${entry.id}:${index}`)) return [];
                const params = variant.params ?? {};
                const reason =
                    entry.owner === "GitHub" || entry.owner === "Stripe"
                        ? "Requires its external provider."
                        : params.action === "authorize"
                          ? "Requires a real authorization action and its recorded outcome."
                          : params.app_callback ||
                              params.app_account ||
                              entry.id === "app-connected"
                            ? "Requires a real SDK connection, browser session, or callback outcome."
                            : "Requires a controlled request delay or failure; no capture recipe is defined yet.";
                return [
                    {
                        id: `${entry.id}--${index}`,
                        pageId: entry.id,
                        title: caseTitle(entry, index),
                        reason,
                    },
                ];
            },
        ),
    );
