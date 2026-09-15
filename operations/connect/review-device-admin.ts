import { loginErrors } from "@shared/auth/login-errors.ts";
import { deviceCodeMessages } from "../../enter.pollinations.ai/frontend/src/lib/device-request.ts";
import { dashboardSignInErrors } from "../../packages/ui/src/modules/auth/dashboard-sign-in-errors.ts";
import { getDefaultErrorMessage } from "../../shared/error.ts";
import { adminScreens } from "./pollen-connect-admin";
import { type DeviceEntry, getDeviceFlow } from "./pollen-connect-device";
import type { ReviewCase } from "./review-cases";
import { fundingReview, fundingSituations } from "./review-funding";

const signInReady = [
    { selector: "#sign-in-title" },
    { selector: 'button:not([disabled]):has-text("Sign in with GitHub")' },
];
const consentReady = [
    { selector: "#authorize-dialog-title" },
    { selector: 'button[aria-busy="false"]:has-text("Allow access")' },
];

// The Device submenu changes only its entry URL. Consent and recovery continue
// through the same Enter pages and the same device record.
export function deviceReviewCasesForSection(
    section: DeviceEntry,
): ReviewCase[] {
    const flow = getDeviceFlow(section);
    const linked = section === "link";
    const signInQuery = {
        screen: "device-signed-out",
        user_code: linked ? "current" : "",
    };
    function recipe(
        id: string,
        pageId: string,
        details: Omit<ReviewCase, "id" | "pageId" | "family" | "title"> & {
            title?: string;
        },
    ): ReviewCase {
        const entry = flow.screens.get(id);
        if (!entry) throw new Error(`Missing device review state: ${id}`);
        return {
            id,
            pageId,
            family: flow.map.nodeForState(id),
            title: details.title ?? entry.title,
            ...details,
        };
    }
    return [
        recipe("sign-in", "sign-in", {
            query: signInQuery,
            prepare: { device: "pending" },
            conditions: { account: "signed-out" },
            expected: signInReady,
        }),
        ...(["pending", "error"] as const).map((outcome) =>
            recipe(
                outcome === "pending" ? "device-signing-in" : "error",
                outcome === "pending" ? "sign-in" : "sign-in-errors",
                {
                    query: signInQuery,
                    prepare: { device: "pending" },
                    conditions: { account: "signed-out" },
                    action: { type: "sign-in", outcome },
                    expected:
                        outcome === "pending"
                            ? [
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
            ),
        ),
        ...Object.values(loginErrors).map((error) =>
            recipe(error.id, "sign-in-errors", {
                title: error.title,
                query:
                    error.id === loginErrors.default.id
                        ? signInQuery
                        : { screen: error.id },
                prepare: { device: "pending" },
                conditions: {
                    account:
                        error.code === loginErrors.banned.code
                            ? "banned"
                            : "signed-out",
                },
                ...(error.id === loginErrors.default.id && {
                    action: {
                        type: "sign-in" as const,
                        outcome: "provider-error" as const,
                    },
                }),
                expected: [
                    { selector: "#sign-in-title", text: error.title },
                    { selector: '[role="alert"]', text: error.message },
                ],
            }),
        ),
        recipe("device-code", "device-code", {
            title: linked ? "Enter another code" : "Enter device code",
            query: { screen: "device", user_code: "" },
            conditions: { account: "signed-in" },
            expected: [
                { selector: "#device-code-title" },
                { selector: 'input[aria-label="Device code"]' },
            ],
        }),
        ...(["invalid", "expired", "used"] as const).flatMap((kind) => {
            const prepare = kind === "invalid" ? undefined : { device: kind };
            return [
                recipe(`device-code-${kind}`, "device-code", {
                    query: {
                        screen: "device",
                        user_code: kind === "invalid" ? "invalid" : "current",
                    },
                    ...(prepare && { prepare }),
                    conditions: { account: "signed-in" },
                    expected: [
                        { selector: "#device-code-title" },
                        {
                            selector: "#device-code-error",
                            text: deviceCodeMessages[kind],
                        },
                    ],
                }),
                recipe(`device-request-${kind}`, "device-errors", {
                    query: {
                        screen: "device-consent",
                        user_code: kind === "invalid" ? "invalid" : "current",
                    },
                    ...(prepare && { prepare }),
                    conditions: { account: "signed-in" },
                    expected: [
                        { selector: "#connection-error-title" },
                        {
                            selector: '[role="alert"]',
                            text: deviceCodeMessages[kind],
                        },
                        { selector: 'button:has-text("Enter another code")' },
                    ],
                }),
            ];
        }),
        recipe("consent", "consent", {
            query: { screen: "device-consent" },
            prepare: { device: "pending" },
            conditions: { account: "signed-in" },
            expected: consentReady,
        }),
        ...fundingSituations.map((situation) => {
            const funding = fundingReview(situation);
            return {
                ...recipe("consent", "consent", {
                    ...funding,
                    title: `Allow access · ${situation.label}`,
                    query: { screen: "device-consent" },
                    prepare: { device: "pending" },
                    expected: [...consentReady, ...funding.expected],
                }),
                id: `consent-${situation.id}`,
            };
        }),
        recipe("device-request-app", "device-errors", {
            query: { screen: "device-consent" },
            prepare: { device: "missing-app" },
            conditions: { account: "signed-in" },
            expected: [
                { selector: "#connection-error-title" },
                { selector: "[role='alert']", text: "app" },
            ],
        }),
        ...([false, true] as const).map((failed) =>
            recipe(
                failed ? "device-submit-approve" : "device-result",
                failed ? "consent" : "device-result",
                {
                    query: { screen: "device-consent" },
                    prepare: { device: "pending" },
                    conditions: { account: "signed-in" },
                    ...(failed && {
                        requests: [
                            {
                                path: "/api/device/approve",
                                method: "POST",
                                outcome: "server-error" as const,
                            },
                        ],
                    }),
                    steps: [
                        {
                            selector: "button",
                            text: "Allow access",
                            action: "click",
                        },
                    ],
                    expected: failed
                        ? [
                              {
                                  selector: "[role='alert']",
                                  text: getDefaultErrorMessage(500),
                              },
                          ]
                        : [
                              {
                                  selector: "#device-result-title",
                                  text: "Access approved",
                              },
                          ],
                },
            ),
        ),
        recipe("device-session", "sign-in", {
            query: signInQuery,
            prepare: { device: "pending" },
            conditions: { account: "signed-in" },
            requests: [{ path: "/api/auth/get-session", outcome: "pending" }],
            expected: [
                {
                    selector: "button[aria-busy='true']",
                    text: "Checking account",
                },
            ],
        }),
        ...(
            [
                [
                    "device-verifying",
                    "device-code",
                    "device",
                    "/api/device/info",
                    "pending",
                    "button[aria-busy='true']",
                    "Verifying",
                ],
                [
                    "device-code-unavailable",
                    "device-code",
                    "device",
                    "/api/device/info",
                    "unavailable",
                    "#device-code-error",
                    deviceCodeMessages.unavailable,
                ],
                [
                    "device-checking",
                    "consent",
                    "device-consent",
                    "/api/device/info",
                    "pending",
                    "button[aria-busy='true']",
                    "Checking app",
                ],
                [
                    "device-request-unavailable",
                    "device-errors",
                    "device-consent",
                    "/api/device/info",
                    "unavailable",
                    "[role='alert']",
                    deviceCodeMessages.unavailable,
                ],
                [
                    "device-request-lookup",
                    "device-errors",
                    "device-consent",
                    "/api/app-lookup",
                    "unavailable",
                    "[role='alert']",
                    "Couldn’t check this connection",
                ],
            ] as const
        ).map(([id, pageId, screen, path, outcome, selector, text]) =>
            recipe(id, pageId, {
                query: { screen, user_code: "current" },
                prepare: { device: "pending" },
                conditions: { account: "signed-in" },
                requests: [{ path, outcome }],
                expected: [{ selector, text }],
            }),
        ),
        ...(
            [
                [
                    "device-approving",
                    "consent",
                    "/api/api-keys",
                    "pending",
                    "Allow access",
                    "button[aria-busy='true']",
                    "Connecting",
                ],
                [
                    "device-denying",
                    "consent",
                    "/api/device/deny",
                    "pending",
                    "Cancel",
                    "button",
                    "Declining",
                ],
                [
                    "device-submit-key",
                    "device-errors",
                    "/api/api-keys",
                    "server-error",
                    "Allow access",
                    "[role='alert']",
                    getDefaultErrorMessage(500),
                ],
                [
                    "device-submit-deny",
                    "device-errors",
                    "/api/device/deny",
                    "server-error",
                    "Cancel",
                    "[role='alert']",
                    "Couldn’t decline this connection",
                ],
                [
                    "device-submit-session",
                    "sign-in-errors",
                    "/api/api-keys",
                    "unauthorized",
                    "Allow access",
                    "[role='alert']",
                    "Your pollinations.ai session expired",
                ],
            ] as const
        ).map(([id, pageId, path, outcome, button, selector, text]) =>
            recipe(id, pageId, {
                query: { screen: "device-consent" },
                prepare: { device: "pending" },
                conditions: { account: "signed-in" },
                requests: [{ path, method: "POST", outcome }],
                steps: [{ selector: "button", text: button, action: "click" }],
                expected: [{ selector, text }],
            }),
        ),
        recipe("device-declined", "device-result", {
            query: { screen: "device-consent" },
            prepare: { device: "pending" },
            conditions: { account: "signed-in" },
            action: { type: "device-deny" },
            expected: [
                {
                    selector: "#device-result-title",
                    text: "Connection declined",
                },
            ],
        }),
    ];
}

function adminRecipe(
    pageId: string,
    id: string,
    details: Omit<ReviewCase, "id" | "pageId" | "family">,
): ReviewCase {
    if (!adminScreens.some((entry) => entry.id === pageId))
        throw new Error(`Missing admin review page: ${pageId}`);
    return { id, pageId, family: pageId, ...details };
}

export const adminReviewCases: ReviewCase[] = [
    adminRecipe("dashboard-sign-in", "dashboard-sign-in", {
        title: "Admin sign-in",
        variant: "Signed out",
        query: { screen: "dashboard-sign-in" },
        conditions: { account: "signed-out", role: "admin" },
        expected: [
            { selector: "#dashboard-sign-in-title", text: "Admin example" },
            {
                selector:
                    'button:not([disabled]):has-text("Sign in with Pollinations")',
            },
        ],
    }),
    ...Object.entries(dashboardSignInErrors).map(([code, error]) =>
        adminRecipe("dashboard-sign-in", `dashboard-${code}`, {
            title: error.label,
            variant: error.label,
            query: { screen: "dashboard-sign-in", auth_error: code },
            conditions: {
                account: "signed-out",
                role: code === "admin_required" ? "member" : "admin",
            },
            expected: [
                { selector: "#dashboard-sign-in-title", text: error.label },
                { selector: '[role="alert"]', text: error.message },
            ],
        }),
    ),
    adminRecipe("identity", "identity", {
        title: "Sign in to Pollinations",
        variant: "Ready",
        query: { screen: "identity" },
        conditions: { account: "signed-out", role: "admin" },
        expected: [
            ...signInReady,
            {
                selector:
                    'label:has-text("Name, email, picture and admin status")',
            },
        ],
    }),
    ...(["pending", "error"] as const).map((outcome) =>
        adminRecipe("identity", `admin-sign-in-${outcome}`, {
            variant:
                outcome === "pending"
                    ? "Signing in"
                    : "Starting sign-in failed",
            title:
                outcome === "pending"
                    ? "Signing in"
                    : "Starting sign-in failed",
            query: { screen: "identity" },
            conditions: { account: "signed-out", role: "admin" },
            action: { type: "sign-in", outcome },
            expected:
                outcome === "pending"
                    ? [
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
        }),
    ),
    ...Object.values(loginErrors).map((error) =>
        adminRecipe("admin-auth-error", `admin-${error.id}`, {
            title: error.title,
            variant: error.title,
            query:
                error.id === loginErrors.default.id
                    ? { screen: "identity" }
                    : { screen: error.id },
            conditions: {
                account:
                    error.code === loginErrors.banned.code
                        ? "banned"
                        : "signed-out",
                role: "admin",
            },
            ...(error.id === loginErrors.default.id && {
                action: {
                    type: "sign-in" as const,
                    outcome: "provider-error" as const,
                },
            }),
            expected: [
                { selector: "#sign-in-title", text: error.title },
                { selector: '[role="alert"]', text: error.message },
            ],
        }),
    ),
    ...(["Signed in", "Account menu", "Sign-out failed"] as const).map(
        (variant, index) =>
            adminRecipe(
                "dashboard-connected",
                [
                    "dashboard-connected",
                    "admin-account-menu",
                    "admin-sign-out-error",
                ][index],
                {
                    title: variant === "Signed in" ? "Admin account" : variant,
                    variant,
                    query: { screen: "dashboard-connected" },
                    conditions: { account: "signed-in", role: "admin" },
                    ...(variant === "Sign-out failed" && {
                        requests: [
                            {
                                path: "/auth/logout",
                                method: "POST",
                                outcome: "server-error",
                            },
                        ],
                    }),
                    steps: [
                        {
                            selector: "button",
                            text: "Sign in with Pollinations",
                            action: "click",
                        },
                        ...(index
                            ? [
                                  {
                                      selector:
                                          "button[aria-label^='Account menu for']",
                                      action: "click" as const,
                                  },
                              ]
                            : []),
                        ...(variant === "Sign-out failed"
                            ? [
                                  {
                                      selector: "button",
                                      text: "Sign out",
                                      action: "click" as const,
                                  },
                              ]
                            : []),
                    ],
                    expected: [
                        { selector: "[data-admin-connected='true']" },
                        ...(variant === "Account menu"
                            ? [
                                  {
                                      selector: "button",
                                      text: "Sign out",
                                  },
                              ]
                            : []),
                        ...(variant === "Sign-out failed"
                            ? [
                                  {
                                      selector: "[role='status']",
                                      text: "Could not sign out. Please try again.",
                                  },
                              ]
                            : []),
                    ],
                },
            ),
    ),
    ...(["pending", "unavailable"] as const).map((outcome) =>
        adminRecipe("dashboard-sign-in", `admin-session-${outcome}`, {
            title:
                outcome === "pending"
                    ? "Checking sign-in"
                    : "Session check failed",
            variant:
                outcome === "pending"
                    ? "Checking sign-in"
                    : "Session check failed",
            query: { screen: "dashboard-sign-in" },
            conditions: { account: "signed-out", role: "admin" },
            requests: [{ path: "/auth/session", outcome }],
            expected:
                outcome === "pending"
                    ? [
                          {
                              selector: "button:disabled",
                              text: "Checking sign-in",
                          },
                      ]
                    : [
                          {
                              selector: "#dashboard-sign-in-title",
                              text: "Couldn’t check account",
                          },
                          {
                              selector: "[role='alert']",
                              text: "Couldn’t check your pollinations.ai account session",
                          },
                      ],
        }),
    ),
];
