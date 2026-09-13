import { loginErrors } from "@shared/auth/login-errors.ts";
import { accountActionScreens } from "./pollen-connect-account-actions";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import {
    dashboardScreens,
    dashboardSectionForScreen,
} from "./pollen-connect-dashboard";
import type { ReviewCase, UnsupportedReviewCase } from "./review-cases";

type DashboardReviewCase = ReviewCase;

const headings: Record<string, string> = {
    "enter-signed-out": "Announcements",
    "enter-connected": "Wallet",
    news: "Announcements",
    catalog: "Models",
    activity: "Events over time",
    quests: "Quests",
    account: "Profile",
    "account-delete": "Delete Pollinations account?",
    keys: "API keys",
    apps: "Apps",
    models: "Models",
    agents: "Agents",
    "key-create": "Create API Key",
    "key-edit": "Edit API Key",
    "key-delete": "Delete API Key",
    "app-create": "Create App Key",
    "app-edit": "Edit App Key",
    "app-delete": "Delete App",
    "model-create": "Add Model",
    "model-edit": "Edit Model",
    "model-delete": "Delete Model",
    "model-visibility": "Hide Model",
    "agent-create": "Add Agent",
    "agent-edit": "Edit Agent",
    "agent-delete": "Delete Agent",
    "agent-visibility": "Hide Agent",
    "account-key": "App access",
    "account-wallet": "Wallet",
};
const heading = (text: string) => ({ selector: "h1, h2, h3", text });
const listContent: Record<string, { populated: string; empty: string }> = {
    keys: { populated: "App example", empty: "Create your first API key" },
    apps: {
        populated: "Example app registration",
        empty: "Create your first app key",
    },
    models: { populated: "Example model", empty: "Add your first model" },
    agents: { populated: "Example agent", empty: "Create your first agent" },
};
const covered = new Set<string>();
function pageRoute(page: CanvasScreen) {
    if (!page.screen) throw new Error(`Missing dashboard route: ${page.id}`);
    return page.screen;
}

function makeCase(
    namespace: string,
    page: CanvasScreen,
    index: number,
    recipe: Partial<DashboardReviewCase> = {},
): DashboardReviewCase {
    covered.add(`${namespace}:${page.id}:${index}`);
    const variant = page.variants?.[index];
    const screen = variant?.screen ?? page.screen;
    if (!screen) throw new Error(`Missing dashboard route: ${page.id}`);
    return {
        id: `${namespace}-${page.id}${index ? `--${index}` : ""}`,
        pageId: page.id,
        family: page.id,
        title:
            index && variant ? `${page.title} · ${variant.label}` : page.title,
        query: { screen },
        conditions: { account: "signed-in" },
        expected: [heading(headings[page.id] ?? page.title)],
        ...recipe,
    };
}

function errorCases(namespace: string, page: CanvasScreen) {
    return Object.values(loginErrors).map((error, index) =>
        makeCase(namespace, page, index, {
            title: error.title,
            query: { screen: error.id },
            conditions: {
                account:
                    error.id === loginErrors.banned.id
                        ? "banned"
                        : "signed-out",
            },
            expected: [
                { selector: "#sign-in-title", text: error.title },
                { selector: '[role="alert"]', text: error.message },
            ],
        }),
    );
}

function providerCase(namespace: string, page: CanvasScreen) {
    return makeCase(namespace, page, 0, {
        title: `${page.title} · external reference`,
        provider: page.owner === "GitHub" ? "GitHub" : "Stripe",
        conditions: {},
        expected: [
            heading(
                page.owner === "GitHub"
                    ? "Continue on GitHub"
                    : page.title === "Manage billing"
                      ? "Manage billing"
                      : "Review purchase",
            ),
        ],
    });
}

function walletCases(namespace: string, page: CanvasScreen) {
    return (page.variants ?? []).flatMap((variant, index) => {
        if (["Loading", "Load failed"].includes(variant.label)) {
            const pending = variant.label === "Loading";
            return [
                makeCase(namespace, page, index, {
                    requests: [
                        {
                            path: "/api/stripe/billing",
                            outcome: pending ? "pending" : "unavailable",
                        },
                    ],
                    expected: pending
                        ? [
                              {
                                  selector:
                                      namespace === "dashboard"
                                          ? "output"
                                          : "h1",
                                  text:
                                      namespace === "dashboard"
                                          ? "Loading wallet"
                                          : "Loading wallet",
                              },
                          ]
                        : [
                              {
                                  selector: "[role='alert']",
                                  text: "Couldn’t load your wallet",
                              },
                          ],
                }),
            ];
        }
        if (
            [
                "Payment pending",
                "Payment check failed",
                "Payment credited",
            ].includes(variant.label)
        ) {
            const failed = variant.label === "Payment check failed";
            const credited = variant.label === "Payment credited";
            return [
                makeCase(namespace, page, index, {
                    query: {
                        screen: pageRoute(page),
                        account_case: credited
                            ? "credited"
                            : failed
                              ? "payment-error"
                              : "pending",
                    },
                    ...(credited && { prepare: { payment: "credited" } }),
                    ...(failed && {
                        requests: [
                            {
                                path: "/api/stripe/checkout-status/*",
                                outcome: "unavailable",
                            },
                        ],
                    }),
                    expected: [
                        {
                            selector: failed ? "[role='alert']" : "output",
                            text: failed
                                ? "Couldn’t check your payment"
                                : credited
                                  ? "Pollen added"
                                  : "Payment hasn’t been credited",
                        },
                    ],
                }),
            ];
        }
        if (
            [
                "Auto top-up setup",
                "Opening billing",
                "Billing handoff failed",
                "Last charge failed",
            ].includes(variant.label)
        ) {
            const opening = variant.label === "Opening billing";
            const failed = variant.label === "Billing handoff failed";
            return [
                makeCase(namespace, page, index, {
                    ...(variant.label === "Last charge failed" && {
                        prepare: { payment: "failed", billing: "enabled" },
                    }),
                    steps: [
                        ...(variant.label === "Last charge failed"
                            ? []
                            : [
                                  {
                                      selector: "[role='switch']",
                                      action: "click" as const,
                                  },
                              ]),
                        ...(opening || failed
                            ? [
                                  {
                                      selector: "button",
                                      text: "Manage billing",
                                      action: "click" as const,
                                  },
                              ]
                            : []),
                    ],
                    ...(opening || failed
                        ? {
                              requests: [
                                  {
                                      path: "/api/stripe/billing/portal",
                                      method: "POST",
                                      outcome: opening
                                          ? ("pending" as const)
                                          : ("unavailable" as const),
                                  },
                              ],
                          }
                        : {}),
                    expected: [
                        {
                            selector: "button, p, div",
                            text: opening
                                ? "Opening..."
                                : failed
                                  ? "Failed to open Stripe"
                                  : variant.label === "Last charge failed"
                                    ? "Last charge failed"
                                    : "Payment method",
                        },
                    ],
                }),
            ];
        }
        if (
            [
                "Auto top-up ready",
                "Auto top-up enabled",
                "Saving auto top-up",
                "Auto top-up save failed",
                "Payment action required",
            ].includes(variant.label)
        ) {
            const enabled =
                variant.label === "Auto top-up enabled" ||
                variant.label === "Payment action required";
            const saving = variant.label === "Saving auto top-up",
                failed = variant.label === "Auto top-up save failed";
            return [
                makeCase(namespace, page, index, {
                    prepare: {
                        billing:
                            variant.label === "Payment action required"
                                ? "payment-action"
                                : enabled
                                  ? "enabled"
                                  : "ready",
                    },
                    ...(!enabled && {
                        steps: [
                            { selector: "[role='switch']", action: "click" },
                            ...(saving || failed
                                ? [
                                      {
                                          selector: "button",
                                          text: "Save",
                                          action: "click" as const,
                                      },
                                  ]
                                : []),
                        ],
                    }),
                    ...(saving || failed
                        ? {
                              requests: [
                                  {
                                      path: "/api/stripe/auto-top-up",
                                      method: "PATCH",
                                      outcome: saving
                                          ? ("pending" as const)
                                          : ("unavailable" as const),
                                  },
                              ],
                          }
                        : {}),
                    expected: saving
                        ? [{ selector: "button:disabled", text: "Save" }]
                        : failed
                          ? [
                                {
                                    selector: "p, div",
                                    text: "Failed to save auto top-up",
                                },
                            ]
                          : variant.label === "Payment action required"
                            ? [
                                  {
                                      selector: "div",
                                      text: "Further steps required in Stripe",
                                  },
                              ]
                            : enabled
                              ? [
                                    {
                                        selector:
                                            "[role='switch'][aria-checked='true']",
                                    },
                                ]
                              : [
                                    {
                                        selector: "button:not(:disabled)",
                                        text: "Save",
                                    },
                                ],
                }),
            ];
        }
        if (["Paid available", "Quest only", "Empty"].includes(variant.label)) {
            return [
                makeCase(namespace, page, index, {
                    expected: [
                        heading("Wallet"),
                        {
                            selector: `.polli-wallet-panel-paid .polli-wallet-balance-value:text-is("${variant.label === "Paid available" ? "10" : "0"}")`,
                        },
                        {
                            selector: `.polli-wallet-panel-tier .polli-wallet-balance-value:text-is("${variant.label === "Quest only" ? "5" : "0"}")`,
                        },
                    ],
                    conditions: {
                        account: "signed-in",
                        pollen:
                            variant.label === "Empty"
                                ? "empty"
                                : variant.label === "Quest only"
                                  ? "quest"
                                  : "paid",
                    },
                }),
            ];
        }
        if (variant.label === "Checkout canceled") {
            return [
                makeCase(namespace, page, index, {
                    query: {
                        screen: pageRoute(page),
                        account_case: "canceled",
                    },
                    expected: [
                        heading("Wallet"),
                        {
                            selector: "p",
                            text: "Checkout canceled.",
                        },
                    ],
                }),
            ];
        }
        if (variant.label === "Sign in") {
            return [
                makeCase(namespace, page, index, {
                    conditions: { account: "signed-out" },
                    expected: [
                        {
                            selector: "#sign-in-title",
                            text: "Sign in to open your wallet",
                        },
                    ],
                }),
            ];
        }
        if (variant.label === "Starting sign-in failed") {
            return [
                makeCase(namespace, page, index, {
                    conditions: { account: "signed-out" },
                    action: { type: "sign-in", outcome: "error" },
                    expected: [
                        {
                            selector: "#sign-in-title",
                            text: loginErrors.default.title,
                        },
                    ],
                }),
            ];
        }
        return [];
    });
}

const dashboardReviewCases = dashboardScreens.flatMap(
    (page): DashboardReviewCase[] => {
        if (page.owner === "GitHub" || page.owner === "Stripe")
            return [providerCase("dashboard", page)];
        if (page.id === "dashboard-auth-error")
            return errorCases("dashboard", page);
        if (page.id === "enter-connected")
            return walletCases("dashboard", page);
        if (page.id === "enter-signed-out")
            return (page.variants ?? []).map((_, index) =>
                makeCase("dashboard", page, index, {
                    conditions: { account: "signed-out" },
                    ...(index && {
                        action: {
                            type: "sign-in" as const,
                            outcome:
                                index === 1
                                    ? ("pending" as const)
                                    : ("error" as const),
                        },
                        expected:
                            index === 1
                                ? [
                                      {
                                          selector: "button[aria-busy='true']",
                                          text: "Signing in",
                                      },
                                  ]
                                : [
                                      {
                                          selector: "[role='alert']",
                                          text: loginErrors.default.message,
                                      },
                                  ],
                    }),
                }),
            );
        const resource =
            /^(keys|apps|models|agents|key-|app-|model-|agent-)/.test(page.id);
        const cases = [
            makeCase("dashboard", page, 0, {
                ...(resource && {
                    prepare: { dashboard: "populated" as const },
                }),
                ...(listContent[page.id] && {
                    expected: [
                        heading(headings[page.id]),
                        {
                            selector: "h3, h4, p, span",
                            text: listContent[page.id].populated,
                        },
                    ],
                }),
                ...(page.id === "activity" && {
                    prepare: { activity: "available" as const },
                }),
                ...(page.id === "quests" && {
                    prepare: { rewards: "available" as const },
                    expected: [
                        { selector: "span", text: "Connect review reward" },
                        { selector: "button", text: "Claim" },
                    ],
                }),
                ...(/-(create|edit|delete|visibility)$/.test(page.id) ||
                page.id === "account-delete"
                    ? {
                          expected: [
                              {
                                  selector: '[role="dialog"]',
                                  text: headings[page.id],
                              },
                          ],
                      }
                    : {}),
            }),
        ];
        if (["keys", "apps", "models", "agents"].includes(page.id)) {
            const index = page.variants?.findIndex(
                (variant) => variant.label === "Empty",
            );
            if (index === undefined || index < 0)
                throw new Error(`Missing empty list: ${page.id}`);
            cases.push(
                makeCase("dashboard", page, index, {
                    prepare: { dashboard: "empty" },
                    expected: [
                        heading(headings[page.id]),
                        { selector: "p", text: listContent[page.id].empty },
                    ],
                }),
            );
        }
        if (page.id === "news")
            cases.push(
                makeCase("dashboard", page, 1, {
                    conditions: { account: "signed-out" },
                }),
            );
        for (const [index, variant] of (page.variants ?? []).entries()) {
            if (
                ["models", "agents", "catalog"].includes(page.id) &&
                ["Loading", "Load failed"].includes(variant.label)
            ) {
                const pending = variant.label === "Loading";
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated" },
                        requests: [
                            {
                                path:
                                    page.id === "catalog"
                                        ? "/gen/models"
                                        : "/api/account/my-models",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        expected: [
                            {
                                selector: pending
                                    ? page.id === "catalog"
                                        ? "button[aria-label='All, 0 models']"
                                        : "output, p, span, td, div"
                                    : "[role='alert']",
                                ...(pending && page.id !== "catalog"
                                    ? { text: "Loading" }
                                    : {}),
                            },
                        ],
                    }),
                );
            }
            const keyForm = /^(key|app)-(create|edit|delete)$/.test(page.id);
            if (
                keyForm &&
                ["Submitting", "Saving", "Deleting", "Failed"].includes(
                    variant.label,
                )
            ) {
                const operation = page.id.split("-")[1];
                const pending = variant.label !== "Failed";
                const path =
                    operation === "create"
                        ? "/api/api-keys"
                        : operation === "edit"
                          ? "/api/api-keys/*/update"
                          : "/api/auth/api-key/delete";
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated" },
                        requests: [
                            {
                                path,
                                method: "POST",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        steps: [
                            ...(operation === "create"
                                ? [
                                      {
                                          selector:
                                              "input[placeholder='Enter API key name']",
                                          action: "fill" as const,
                                          value: "Connect review",
                                      },
                                  ]
                                : []),
                            {
                                selector: "button",
                                text:
                                    operation === "create"
                                        ? "Create key"
                                        : operation === "edit"
                                          ? "Save"
                                          : "Delete",
                                action: "click",
                            },
                        ],
                        expected: [
                            {
                                selector: pending ? "button" : "[role='alert']",
                                ...(pending
                                    ? {
                                          text:
                                              operation === "create"
                                                  ? "Creating"
                                                  : operation === "edit"
                                                    ? "Saving"
                                                    : "Deleting",
                                      }
                                    : {}),
                            },
                        ],
                    }),
                );
            }
        }
        for (const [index, variant] of (page.variants ?? []).entries()) {
            const label = variant.label;
            if (
                label === "Created · copy key" &&
                /^(key|app)-create$/.test(page.id)
            )
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated" },
                        steps: [
                            {
                                selector:
                                    "input[placeholder='Enter API key name']",
                                action: "fill",
                                value:
                                    page.id === "key-create"
                                        ? "CONNECT_REVIEW_API_KEY"
                                        : "CONNECT_REVIEW_APP_KEY",
                            },
                            {
                                selector: "button",
                                text: "Create key",
                                action: "click",
                            },
                        ],
                        expected: [
                            { selector: "[role='dialog'] input[readonly]" },
                            {
                                selector: "[role='dialog'] button",
                                text: "Copy",
                            },
                        ],
                    }),
                );
            if (page.id === "model-edit" && label === "Test succeeded")
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: {
                            dashboard: "populated",
                            endpoint: "success",
                        },
                        steps: [
                            {
                                selector:
                                    "input[name='community-api-bearer-token']",
                                action: "fill",
                                value: "invalid-review-placeholder",
                            },
                            {
                                selector: "button",
                                text: "Test endpoint",
                                action: "click",
                            },
                        ],
                        expected: [
                            {
                                selector: "[role='dialog']",
                                text: "JSON and streaming requests returned valid token usage",
                            },
                        ],
                    }),
                );
            if (page.id === "account" && label.includes("Discord")) {
                const connect = [
                    "Connecting Discord",
                    "Discord connection failed",
                ].includes(label);
                const idle = [
                    "Discord connected",
                    "Discord identity unavailable",
                ].includes(label);
                const pending = [
                    "Connecting Discord",
                    "Disconnecting Discord",
                ].includes(label);
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: {
                            connections: "available",
                            ...(!connect && {
                                discord:
                                    label === "Discord identity unavailable"
                                        ? ("unavailable" as const)
                                        : ("connected" as const),
                            }),
                        },
                        ...(!idle && {
                            requests: [
                                {
                                    path: connect
                                        ? "/api/auth/link-social"
                                        : "/api/auth/unlink-account",
                                    method: "POST",
                                    outcome: pending
                                        ? ("pending" as const)
                                        : ("unavailable" as const),
                                },
                            ],
                            steps: [
                                {
                                    selector: "button",
                                    text: connect
                                        ? "Connect Discord"
                                        : "Disconnect Discord",
                                    action: "click",
                                },
                            ],
                        }),
                        expected: [
                            {
                                selector: "button, p",
                                text:
                                    label === "Discord connected"
                                        ? "@connect-review"
                                        : idle
                                          ? "Disconnect Discord"
                                          : pending
                                            ? "Working..."
                                            : connect
                                              ? "Could not connect Discord"
                                              : "Could not disconnect Discord",
                            },
                        ],
                    }),
                );
            }
            if (label === "Public publishing")
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated", listing: "public" },
                        ...(/-(create|edit)$/.test(page.id) && {
                            steps: [
                                {
                                    selector: "[role='dialog'] button",
                                    text: "Public",
                                    action: "click",
                                },
                            ],
                        }),
                        expected: [
                            {
                                selector: /-(create|edit)$/.test(page.id)
                                    ? "[role='dialog']"
                                    : "button",
                                text: /-(create|edit)$/.test(page.id)
                                    ? "Public"
                                    : "Save",
                            },
                        ],
                    }),
                );
            if (page.id === "activity" && label === "No activity")
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { activity: "empty" },
                        expected: [
                            {
                                selector: "p",
                                text: "No transactions in this selected period",
                            },
                        ],
                    }),
                );
            if (
                page.id === "account" &&
                [
                    "App connected",
                    "Connecting app",
                    "App connection failed",
                    "Disconnecting app",
                    "App disconnect failed",
                ].includes(label)
            ) {
                const connected =
                    label === "App connected" ||
                    label.startsWith("Disconnect") ||
                    label === "App disconnect failed";
                const pending =
                    label === "Connecting app" || label === "Disconnecting app";
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: {
                            connections: connected ? "connected" : "available",
                        },
                        ...(label !== "App connected" && {
                            requests: [
                                {
                                    path: connected
                                        ? "/api/account/integrations/*"
                                        : "/api/account/integrations",
                                    method: connected ? "DELETE" : "POST",
                                    outcome: pending
                                        ? ("pending" as const)
                                        : ("unavailable" as const),
                                },
                            ],
                            steps: [
                                {
                                    selector: "button",
                                    text: connected ? "Disconnect" : "Connect",
                                    action: "click",
                                },
                            ],
                        }),
                        expected: [
                            {
                                selector:
                                    label === "App connected" || pending
                                        ? "button"
                                        : "[role='alert']",
                                text:
                                    label === "App connected"
                                        ? "Disconnect"
                                        : pending
                                          ? connected
                                              ? "Disconnecting..."
                                              : "Connecting..."
                                          : connected
                                            ? "Could not disconnect this app"
                                            : "Could not connect this app",
                            },
                        ],
                    }),
                );
            }
            const form = /^(model|agent)-(create|edit|delete|visibility)$/.exec(
                page.id,
            );
            if (
                form &&
                [
                    "Submitting",
                    "Saving",
                    "Deleting",
                    "Failed",
                    "Updating visibility",
                    "Visibility update failed",
                    "Testing endpoint",
                    "Test failed",
                ].includes(label)
            ) {
                const [, kind, op] = form;
                const agent = kind === "agent";
                const testing = label.startsWith("Test");
                const pending = ![
                    "Failed",
                    "Visibility update failed",
                    "Test failed",
                ].includes(label);
                const base =
                    agent && op !== "visibility"
                        ? "/api/account/agents"
                        : "/api/account/my-models";
                const path = testing
                    ? "/api/account/my-models/test"
                    : op === "create"
                      ? base
                      : op === "delete"
                        ? `${base}/*`
                        : agent && op === "edit"
                          ? `${base}/*`
                          : `${base}/*/update`;
                const text = testing
                    ? "Test endpoint"
                    : op === "delete"
                      ? "Delete"
                      : op === "visibility"
                        ? "Hide"
                        : op === "edit"
                          ? `Save ${agent ? "Agent" : "Model"}`
                          : `Add Private ${agent ? "Agent" : "Model"}`;
                const fields =
                    op === "create"
                        ? [
                              [
                                  "input[name='community-model-name']",
                                  "review-example",
                              ],
                              [
                                  "input[name='community-model-title']",
                                  "Review example",
                              ],
                              ...(agent
                                  ? [
                                        [
                                            "textarea[name='prompt-agent-system-prompt']",
                                            "Answer briefly.",
                                        ],
                                        [
                                            "input[name='prompt-agent-base-model']",
                                            "openai",
                                        ],
                                    ]
                                  : [
                                        [
                                            "input[name='community-endpoint-url']",
                                            "https://connect-review.invalid/v1/chat/completions",
                                        ],
                                        [
                                            "input[name='community-api-bearer-token']",
                                            "invalid-review-placeholder",
                                        ],
                                    ]),
                          ]
                        : testing
                          ? [
                                [
                                    "input[name='community-api-bearer-token']",
                                    "invalid-review-placeholder",
                                ],
                            ]
                          : [];
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated" },
                        requests: [
                            {
                                path,
                                method:
                                    op === "delete"
                                        ? "DELETE"
                                        : agent && op === "edit"
                                          ? "PATCH"
                                          : "POST",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        steps: [
                            ...fields.map(([selector, value]) => ({
                                selector,
                                value,
                                action: "fill" as const,
                            })),
                            {
                                selector: "[role='dialog'] button",
                                text,
                                action: "click",
                            },
                        ],
                        expected: [
                            {
                                selector: pending
                                    ? "button"
                                    : testing
                                      ? "[role='dialog'] p.text-intent-danger-text"
                                      : "[role='alert']",

                                ...(pending
                                    ? {
                                          text: testing
                                              ? "Testing"
                                              : op === "visibility"
                                                ? "Hiding"
                                                : op === "delete"
                                                  ? "Deleting"
                                                  : "Saving",
                                      }
                                    : {}),
                            },
                        ],
                    }),
                );
            }
            if (
                (["models", "agents"].includes(page.id) &&
                    label === "Hidden") ||
                (form && label === "Relist")
            ) {
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated", listing: "hidden" },
                        query: { screen: pageRoute(page), listing: "hidden" },
                        expected: [
                            {
                                selector: form ? "[role='dialog']" : "button",
                                text: "Relist",
                            },
                        ],
                    }),
                );
            }
            if (page.id === "model-edit" && label === "Changes queued")
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: { dashboard: "populated", listing: "queued" },
                        expected: [
                            { selector: "[role='dialog']", text: "queued" },
                        ],
                    }),
                );
            if (page.id === "agent-edit" && label === "Endpoint agent")
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: {
                            dashboard: "populated",
                            listing: "endpoint-agent",
                        },
                        expected: [
                            {
                                selector:
                                    "[role='dialog'] input[name='community-endpoint-url']",
                            },
                        ],
                    }),
                );
            if (page.id === "quests" && index > 0) {
                const loading = label === "Loading",
                    failed = label === "Load failed",
                    checking = label === "Checking quests",
                    checkFailed = label === "Check unavailable";
                const claiming = label === "Claiming",
                    claimFailed = label === "Claim failed";
                cases.push(
                    makeCase("dashboard", page, index, {
                        prepare: {
                            rewards:
                                label === "No earned rewards"
                                    ? "empty"
                                    : label === "Reward claimed"
                                      ? "claimed"
                                      : "available",
                        },
                        requests: [
                            {
                                path:
                                    loading || failed
                                        ? "/api/quests/rewards"
                                        : claiming || claimFailed
                                          ? "/api/quests/rewards/*/claim"
                                          : "/api/quests/check",
                                method: loading || failed ? "GET" : "POST",
                                outcome:
                                    loading || checking || claiming
                                        ? "pending"
                                        : "unavailable",
                            },
                            ...(claiming || claimFailed
                                ? [
                                      {
                                          path: "/api/quests/check",
                                          method: "POST",
                                          outcome: "unavailable" as const,
                                      },
                                  ]
                                : []),
                        ],
                        ...(claiming || claimFailed
                            ? {
                                  steps: [
                                      {
                                          selector: "button",
                                          text: "Claim",
                                          action: "click",
                                      },
                                  ],
                              }
                            : {}),
                        expected: [
                            {
                                selector:
                                    label === "No earned rewards"
                                        ? "h2, h3"
                                        : "p, span, button",
                                text: loading
                                    ? "Loading quests"
                                    : failed
                                      ? "Failed to load quests"
                                      : checking
                                        ? "Checking for new quests"
                                        : claiming
                                          ? "Claiming"
                                          : claimFailed
                                            ? "Failed to claim reward"
                                            : checkFailed
                                              ? "Connect review reward"
                                              : label === "Reward claimed"
                                                ? "Connect review reward"
                                                : "Setup",
                            },
                        ],
                    }),
                );
            }
            if (
                page.id === "activity" &&
                ["Loading", "Load failed"].includes(label)
            )
                cases.push(
                    makeCase("dashboard", page, index, {
                        requests: [
                            {
                                path: "/api/account/usage/daily",
                                outcome:
                                    label === "Loading"
                                        ? "pending"
                                        : "unavailable",
                            },
                        ],
                        expected: [
                            {
                                selector: "p",
                                text:
                                    label === "Loading"
                                        ? "Fetching usage data"
                                        : "Failed to fetch usage data",
                            },
                        ],
                    }),
                );
            if (
                page.id === "account" &&
                ["Loading connections", "Connections unavailable"].includes(
                    label,
                )
            )
                cases.push(
                    makeCase("dashboard", page, index, {
                        requests: [
                            {
                                path: "/api/account/integrations",
                                outcome:
                                    label === "Loading connections"
                                        ? "pending"
                                        : "unavailable",
                            },
                        ],
                        expected: [
                            {
                                selector: "p, div",
                                text:
                                    label === "Loading connections"
                                        ? "Loading connected apps"
                                        : "Could not load connected apps",
                            },
                        ],
                    }),
                );
            if (page.id === "account-delete" && index > 0)
                cases.push(
                    makeCase("dashboard", page, index, {
                        steps: [
                            {
                                selector: "[role='dialog'] input",
                                action: "fill",
                                value: "DELETE",
                            },
                            ...(label === "Acknowledged"
                                ? []
                                : [
                                      {
                                          selector: "[role='dialog'] button",
                                          text: "Delete account",
                                          action: "click" as const,
                                      },
                                  ]),
                        ],
                        ...(label === "Acknowledged"
                            ? {}
                            : {
                                  requests: [
                                      {
                                          path: "/api/auth/delete-user",
                                          method: "POST",
                                          outcome:
                                              label === "Deleting"
                                                  ? ("pending" as const)
                                                  : ("unavailable" as const),
                                      },
                                  ],
                              }),
                        expected: [
                            {
                                selector:
                                    label === "Acknowledged"
                                        ? "[role='dialog'] button:not(:disabled)"
                                        : label === "Deleting"
                                          ? "button"
                                          : "[role='alert']",
                                text:
                                    label === "Acknowledged"
                                        ? "Delete account"
                                        : label === "Deleting"
                                          ? "Deleting"
                                          : undefined,
                            },
                        ],
                    }),
                );
        }
        return cases;
    },
);

export function dashboardReviewCasesForSection(section: string) {
    return dashboardReviewCases.filter(
        (recipe) => dashboardSectionForScreen(recipe.pageId) === section,
    );
}

export const appTopupReviewCases: DashboardReviewCase[] =
    accountActionScreens.flatMap((page): DashboardReviewCase[] => {
        if (page.owner === "GitHub" || page.owner === "Stripe")
            return [providerCase("topup", page)];
        if (page.id === "account-auth-error") return errorCases("topup", page);
        if (page.id === "account-wallet") return walletCases("topup", page);
        if (page.id === "account-app")
            return (page.variants ?? []).map((_, index) =>
                makeCase("topup", page, index, {
                    conditions: { account: "signed-in" },
                    query: { screen: "add-pollen-connect" },
                    steps: [
                        {
                            selector: "button",
                            text: "Connect with Pollinations",
                            action: "click",
                        },
                        ...(index
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
                        { selector: "[data-connect-state='connected']" },
                        ...(index
                            ? [
                                  {
                                      selector: "button, span",
                                      text: "Limit reached",
                                  },
                              ]
                            : []),
                    ],
                }),
            );
        if (page.id !== "account-key")
            throw new Error(`Missing top-up recipe: ${page.id}`);
        return (page.variants ?? []).flatMap((variant, index) => {
            if (["Loading", "Load failed"].includes(variant.label)) {
                const pending = variant.label === "Loading";
                return [
                    makeCase("topup", page, index, {
                        prepare: { dashboard: "populated" },
                        requests: [
                            {
                                path: "/api/api-keys",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        expected: [
                            {
                                selector: pending ? "h1" : "[role='alert']",
                                text: pending
                                    ? "Loading app access"
                                    : "Couldn’t load app access",
                            },
                        ],
                    }),
                ];
            }
            if (
                [
                    "Saving",
                    "Save failed",
                    "Saved",
                    "Closed without changes",
                ].includes(variant.label)
            ) {
                const cancel = variant.label === "Closed without changes";
                return [
                    makeCase("topup", page, index, {
                        prepare: { dashboard: "populated" },
                        ...(["Saving", "Save failed"].includes(
                            variant.label,
                        ) && {
                            requests: [
                                {
                                    path: "/api/api-keys/*/update",
                                    method: "POST",
                                    outcome:
                                        variant.label === "Saving"
                                            ? ("pending" as const)
                                            : ("unavailable" as const),
                                },
                            ],
                        }),
                        steps: [
                            {
                                selector: "button",
                                text: cancel ? "Cancel" : "Save",
                                action: "click",
                            },
                        ],
                        expected:
                            variant.label === "Saving"
                                ? [{ selector: "button", text: "Saving" }]
                                : variant.label === "Save failed"
                                  ? [
                                        {
                                            selector: "[role='alert']",
                                            text: "We're temporarily down for maintenance. Sorry about that!",
                                        },
                                    ]
                                  : [
                                        heading(
                                            cancel
                                                ? "No changes"
                                                : "App access updated",
                                        ),
                                    ],
                    }),
                ];
            }
            if (index === 0)
                return [
                    makeCase("topup", page, index, {
                        prepare: { dashboard: "populated" },
                    }),
                ];
            if (variant.label === "Sign in")
                return [
                    makeCase("topup", page, index, {
                        conditions: { account: "signed-out" },
                        expected: [
                            {
                                selector: "#sign-in-title",
                                text: "Sign in to manage app access",
                            },
                        ],
                    }),
                ];
            if (variant.label === "Starting sign-in failed")
                return [
                    makeCase("topup", page, index, {
                        conditions: { account: "signed-out" },
                        action: { type: "sign-in", outcome: "error" },
                        expected: [
                            {
                                selector: "#sign-in-title",
                                text: loginErrors.default.title,
                            },
                        ],
                    }),
                ];
            if (variant.label === "Key unavailable")
                return [
                    makeCase("topup", page, index, {
                        query: {
                            screen: pageRoute(page),
                            account_case: "missing",
                        },
                        expected: [heading("App access unavailable")],
                    }),
                ];
            return [];
        });
    });

function unsupported(
    namespace: string,
    inventory: CanvasScreen[],
): UnsupportedReviewCase[] {
    return inventory.flatMap((page) =>
        (page.variants ?? [{ label: page.title }]).flatMap((variant, index) => {
            if (covered.has(`${namespace}:${page.id}:${index}`)) return [];
            return [
                {
                    id: `${namespace}-${page.id}--${index}`,
                    pageId: page.id,
                    title: `${page.title} · ${variant.label}`,
                    reason:
                        page.id === "account-app"
                            ? "Requires a completed SDK connection; visual fixture keys cannot authenticate."
                            : "Requires a real request outcome or additional database conditions; this state has no capture recipe yet.",
                },
            ];
        }),
    );
}

export const unsupportedAppTopupReviewCases = unsupported(
    "topup",
    accountActionScreens,
);
export function unsupportedDashboardReviewCasesForSection(section: string) {
    return unsupported(
        "dashboard",
        dashboardScreens.filter(
            (page) => dashboardSectionForScreen(page.id) === section,
        ),
    );
}
