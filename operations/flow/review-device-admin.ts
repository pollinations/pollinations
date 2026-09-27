import { getDefaultErrorMessage } from "../../shared/error.ts";
import { adminScreens } from "./flow-admin";
import { type DeviceEntry, getDeviceFlow } from "./flow-device";
import {
    adminSignInSituations,
    deviceCodeExpectations,
    loginSituations,
} from "./review-auth";
import type { ReviewCase } from "./review-cases";
import { consentExpected } from "./review-consent";
import { fundingReview, fundingSituations } from "./review-funding";

const signInReady = [
    { selector: "h1" },
    { selector: 'button:enabled:has-text("Sign in with GitHub")' },
];
const consentReady = [
    ...consentExpected("device"),
    { selector: 'button:enabled:text-is("Allow access")' },
];
const declined = [{ selector: "h1", text: "Access declined" }];
function deviceError(message: string): ReviewCase["expected"] {
    return [
        { selector: "h1", text: "Allow your device" },
        { selector: '[role="alert"]', text: message },
        { selector: 'button:enabled:text-is("Decline")' },
        { selector: 'body:not(:has(button:text-is("Try again")))' },
    ];
}

// Both entrances use current Enter's Device and Authorize pages. The notes
// describe product gaps outside the product frame; they never render its UI.
export function deviceReviewCasesForSection(
    section: DeviceEntry,
): ReviewCase[] {
    const flow = getDeviceFlow(section);
    const signInQuery = {
        screen: "device-signed-out",
        user_code: section === "link" ? "current" : "",
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
                                      selector: "button:disabled",
                                      text: "Signing in",
                                  },
                              ]
                            : [
                                  { selector: "h1", text: "Allow your device" },
                                  {
                                      selector: '[role="alert"]',
                                      text: "We couldn’t sign you in to your Pollinations account. Please try again.",
                                  },
                              ],
                },
            ),
        ),
        ...Object.values(loginSituations).map((error) =>
            recipe(error.id, "sign-in-errors", {
                title: error.title,
                query:
                    error.id === loginSituations.default.id
                        ? signInQuery
                        : { screen: error.id },
                prepare: { device: "pending" },
                conditions: {
                    account:
                        error.code === loginSituations.banned.code
                            ? "banned"
                            : "signed-out",
                },
                ...(error.id === loginSituations.default.id && {
                    action: {
                        type: "sign-in" as const,
                        outcome: "provider-error" as const,
                    },
                    finalRoute: "/error",
                }),
                expected: [
                    { selector: "h1", text: "Sign in" },
                    { selector: '[role="alert"]', text: error.message },
                ],
            }),
        ),
        recipe("device-code", "device-code", {
            title:
                section === "link" ? "Enter another code" : "Enter device code",
            query: { screen: "device", user_code: "" },
            conditions: { account: "signed-in" },
            expected: [
                { selector: "h1", text: "Allow your device" },
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
                        {
                            selector: "#device-code-form",
                            text: deviceCodeExpectations[kind],
                        },
                        { selector: 'button:enabled:text-is("Continue")' },
                    ],
                }),
                recipe(
                    `device-request-${kind}`,
                    kind === "used" ? "consent" : "device-errors",
                    {
                        query: {
                            screen: "device-consent",
                            user_code:
                                kind === "invalid" ? "invalid" : "current",
                        },
                        ...(prepare && { prepare }),
                        conditions: { account: "signed-in" },
                        note:
                            kind === "used"
                                ? "Main’s direct authorization page ignores the device status returned by /api/device/info and still offers Allow access for a used code. The device endpoint enforces status only when approval is submitted."
                                : "Main reports Invalid device code for both invalid and expired direct links. It offers Decline, with no code-entry or retry action.",
                        expected:
                            kind === "used"
                                ? consentReady
                                : deviceError("Invalid device code"),
                    },
                ),
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
            expected: deviceError(
                "This app key could not be verified. Authorization blocked.",
            ),
        }),
        ...([false, true] as const).map((failed) =>
            recipe(
                failed ? "device-submit-approve" : "device-result",
                failed ? "device-errors" : "device-result",
                {
                    query: { screen: "device-consent" },
                    prepare: { device: "pending" },
                    conditions: { account: "signed-in" },
                    ...(failed && {
                        requests: [
                            {
                                path: "/api/device/approve",
                                method: "POST" as const,
                                outcome: "server-error" as const,
                            },
                        ],
                        note: "Main creates a key before approval. When approval fails, it keeps that key and offers Decline, without retry. Its generic approval error hides the endpoint response (G02, G06).",
                    }),
                    steps: [
                        {
                            selector: "button",
                            text: "Allow access",
                            action: "click",
                        },
                    ],
                    expected: failed
                        ? deviceError("Failed to approve device")
                        : [{ selector: "h1", text: "Access allowed" }],
                },
            ),
        ),
        recipe("device-session", "sign-in", {
            query: signInQuery,
            prepare: { device: "pending" },
            conditions: { account: "signed-in" },
            requests: [{ path: "/api/auth/get-session", outcome: "pending" }],
            expected: [{ selector: "output", text: "Loading…" }],
        }),
        ...(
            [
                [
                    "device-verifying",
                    "device-code",
                    "device",
                    "/api/device/info",
                    "pending",
                    "button:disabled",
                    "Checking code…",
                ],
                [
                    "device-code-unavailable",
                    "device-code",
                    "device",
                    "/api/device/info",
                    "unavailable",
                    "#device-code-form",
                    "Code not recognized. Check it and try again.",
                ],
                [
                    "device-checking",
                    "consent",
                    "device-consent",
                    "/api/device/info",
                    "pending",
                    "button:enabled",
                    "Allow access",
                ],
                [
                    "device-request-unavailable",
                    "device-errors",
                    "device-consent",
                    "/api/device/info",
                    "unavailable",
                    '[role="alert"]',
                    "Invalid device code",
                ],
                [
                    "device-request-lookup",
                    "device-errors",
                    "device-consent",
                    "/api/app-lookup",
                    "unavailable",
                    '[role="alert"]',
                    "This app key could not be verified",
                ],
            ] as const
        ).map(([id, pageId, screen, path, outcome, selector, text]) =>
            recipe(id, pageId, {
                query: { screen, user_code: "current" },
                prepare: { device: "pending" },
                conditions: { account: "signed-in" },
                requests: [{ path, outcome }],
                note:
                    id === "device-checking"
                        ? "Main keeps Allow access enabled while the direct device lookup is pending. There is no separate request-checking screen."
                        : id === "device-code-unavailable" ||
                            id === "device-request-unavailable"
                          ? "Main presents this injected service failure as an invalid code (G04)."
                          : id === "device-request-lookup"
                            ? "Main presents an app lookup failure as an unverified key. Recovery offers Decline, without retry (G01)."
                            : undefined,
                expected: [
                    ...(pageId === "device-errors"
                        ? deviceError(text)
                        : [{ selector, text }]),
                ],
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
                ],
                [
                    "device-denying",
                    "consent",
                    "/api/device/deny",
                    "pending",
                    "Decline",
                ],
                [
                    "device-submit-key",
                    "device-errors",
                    "/api/api-keys",
                    "server-error",
                    "Allow access",
                ],
                [
                    "device-submit-deny",
                    "device-result",
                    "/api/device/deny",
                    "server-error",
                    "Decline",
                ],
                [
                    "device-submit-session",
                    "device-errors",
                    "/api/api-keys",
                    "unauthorized",
                    "Allow access",
                ],
            ] as const
        ).map(([id, pageId, path, outcome, button]) =>
            recipe(id, pageId, {
                query: { screen: "device-consent" },
                prepare: { device: "pending" },
                conditions: { account: "signed-in" },
                requests: [{ path, method: "POST", outcome }],
                steps: [{ selector: "button", text: button, action: "click" }],
                note:
                    id === "device-submit-deny"
                        ? "Main shows Access declined even when the decline endpoint fails. The device record remains pending (G05)."
                        : id === "device-denying"
                          ? "Main leaves both consent buttons enabled while the decline request is pending; it has no declining indicator."
                          : id === "device-submit-session"
                            ? "Main shows the key endpoint’s 401 error with Decline. It has no sign-in recovery here (G02)."
                            : undefined,
                expected:
                    id === "device-approving"
                        ? [{ selector: "button:disabled", text: "Connecting…" }]
                        : id === "device-denying"
                          ? consentReady
                          : id === "device-submit-deny"
                            ? declined
                            : deviceError(
                                  getDefaultErrorMessage(
                                      outcome === "unauthorized" ? 401 : 500,
                                  ),
                              ),
            }),
        ),
        recipe("device-declined", "device-result", {
            query: { screen: "device-consent" },
            prepare: { device: "pending" },
            conditions: { account: "signed-in" },
            action: { type: "device-deny" },
            expected: declined,
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
            { selector: "h1", text: "Sign in" },
            {
                selector:
                    'button:not([disabled]):has-text("Sign in with Pollinations")',
            },
        ],
    }),
    ...Object.entries(adminSignInSituations).map(([code, error]) =>
        adminRecipe("dashboard-sign-in", `dashboard-${code}`, {
            title: error.label,
            variant: error.label,
            query: { screen: "dashboard-sign-in", auth_error: code },
            note: "Opens the real dashboard callback-error URL. This capture verifies its copy and recovery control, not a completed provider exchange.",
            conditions: {
                account: "signed-out",
                role: code === "admin_required" ? "member" : "admin",
            },
            expected: [
                { selector: "h1", text: error.label },
                { selector: '[role="alert"]', text: error.message },
            ],
        }),
    ),
    adminRecipe("identity", "identity", {
        title: "Sign in to Pollinations",
        variant: "Ready",
        query: { screen: "identity" },
        finalRoute: "/app/sign-in",
        conditions: { account: "signed-out", role: "admin" },
        expected: [
            ...signInReady,
            { selector: "p", text: "with your Pollinations admin account." },
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
            finalRoute: "/app/sign-in",
            conditions: { account: "signed-out", role: "admin" },
            action: { type: "sign-in", outcome },
            expected:
                outcome === "pending"
                    ? [
                          {
                              selector: "button:disabled",
                              text: "Signing in",
                          },
                      ]
                    : [
                          {
                              selector: "h1",
                              text: "Sign in",
                          },
                          {
                              selector: '[role="alert"]',
                              text: "We couldn’t sign you in to your Pollinations account. Please try again.",
                          },
                      ],
        }),
    ),
    ...Object.values(loginSituations).map((error) =>
        adminRecipe("admin-auth-error", `admin-${error.id}`, {
            title: error.title,
            variant: error.title,
            query:
                error.id === loginSituations.default.id
                    ? { screen: "identity" }
                    : { screen: error.id },
            conditions: {
                account:
                    error.code === loginSituations.banned.code
                        ? "banned"
                        : "signed-out",
                role: "admin",
            },
            ...(error.id === loginSituations.default.id && {
                finalRoute: "/error",
                action: {
                    type: "sign-in" as const,
                    outcome: "provider-error" as const,
                },
            }),
            expected: [
                { selector: "h1", text: "Sign in" },
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
                    note: "Uses the real Enter OAuth exchange and dashboard session on a separate local origin. Running this situation creates disposable local OAuth credentials.",
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
                              selector: "output",
                              text: "Checking sign-in…",
                          },
                      ]
                    : [
                          {
                              selector: "h1",
                              text: "Couldn’t check your session",
                          },
                          {
                              selector: "[role='alert']",
                              text: "Could not check your session. Please try again.",
                          },
                      ],
        }),
    ),
];
