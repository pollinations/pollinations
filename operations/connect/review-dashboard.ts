import { loginErrors } from "@shared/auth/login-errors.ts";
import { getDefaultErrorMessage } from "@shared/error.ts";
import { accountActionScreens } from "./pollen-connect-account-actions";
import {
    type CanvasScreen,
    type ScreenVariant,
    screenVariant,
    screenVariantId,
} from "./pollen-connect-canvas-data";
import {
    dashboardScreens,
    dashboardSectionForScreen,
} from "./pollen-connect-dashboard";
import type { ReviewCase } from "./review-cases";

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
const newsContent = [
    heading("Announcements"),
    { selector: "#canonical-model-slugs" },
    heading("News"),
    heading("FAQ"),
];
const noPageError = { selector: 'body:not(:has([role="alert"]))' };
const appsSection = 'section:has(h2:text-is("Connect apps"))';
const discordSection = 'section:has(h2:text-is("Connected accounts"))';
const appsLoaded = { selector: `${appsSection}:not(:has([role="status"]))` };
const availableApps = [
    { selector: `${appsSection} p:text-is("GitHub")` },
    { selector: `${appsSection} button[aria-label="Connect GitHub"]` },
    {
        selector: `${appsSection}:not(:has(button[aria-label="Disconnect GitHub"]))`,
    },
];
const connectedApps = [
    { selector: `${appsSection} p:text-is("GitHub")` },
    { selector: `${appsSection} p:text-is("Connect review")` },
    { selector: `${appsSection} p:text-is("Ready to use")` },
    { selector: `${appsSection} button[aria-label="Disconnect GitHub"]` },
    {
        selector: `${appsSection} p`,
        text: "No more apps to show. Search for another app to connect.",
    },
];
// An expected failure may not conceal an unrelated failure in the same section.
const appsAlert = (text?: string) => ({
    selector: text
        ? `${appsSection}:has([role="alert"]:has-text(${JSON.stringify(text)})):not(:has([role="alert"]:not(:has-text(${JSON.stringify(text)})))):not(:has([role="alert"] ~ [role="alert"]))`
        : `${appsSection}:not(:has([role="alert"]))`,
});
const discordDisconnected = {
    selector: `${discordSection}:not(:has([role="alert"])) button:text-is("Connect Discord"):enabled`,
};
const appsReady = [
    appsLoaded,
    appsAlert(),
    ...availableApps,
    { selector: `${appsSection} button[aria-label="Connect GitHub"]:enabled` },
];
const questsIdle = {
    selector:
        'body:not(:has(.text-intent-danger-text)):not(:has(span:text-is("Checking for new quests…")))',
};
const newsAccount = (signedIn: boolean) => ({
    // The dashboard drawer is closed on mobile, but its account controls still
    // identify the rendered session. Keep the page visible while checking them.
    selector: signedIn
        ? 'body:has(button[aria-label^="Account menu for "]):not(:has(button:has-text("Sign in with GitHub"))) :is(h1,h2,h3)'
        : 'body:has(button:has-text("Sign in with GitHub")):not(:has(button[aria-label^="Account menu for "])) :is(h1,h2,h3)',
    text: "Announcements",
});
const listContent: Record<string, { populated: string; empty: string }> = {
    keys: { populated: "App example", empty: "Create your first API key" },
    apps: {
        populated: "Example app registration",
        empty: "Create your first app key",
    },
    models: { populated: "Example model", empty: "Add your first model" },
    agents: { populated: "Example agent", empty: "Create your first agent" },
};
function pageRoute(page: CanvasScreen) {
    if (!page.screen) throw new Error(`Missing dashboard route: ${page.id}`);
    return page.screen;
}

function makeCase(
    namespace: string,
    page: CanvasScreen,
    selection: Pick<ScreenVariant, "screen" | "params">,
    recipe: Partial<DashboardReviewCase> = {},
): DashboardReviewCase {
    const variant = screenVariant(page, selection);
    const id = screenVariantId(page, selection);
    const screen = variant?.screen ?? page.screen;
    if (!screen) throw new Error(`Missing dashboard route: ${page.id}`);
    return {
        id: `${namespace}-${page.id}${id === "default" ? "" : `--${id}`}`,
        pageId: page.id,
        family: page.id,
        variant: variant?.label ?? page.title,
        title:
            id !== "default" && variant
                ? `${page.title} · ${variant.label}`
                : page.title,
        query: { screen },
        conditions: { account: "signed-in" },
        expected: [heading(headings[page.id] ?? page.title)],
        ...recipe,
    };
}

function errorCases(namespace: string, page: CanvasScreen) {
    return Object.values(loginErrors).map((error) => {
        const variant = page.variants?.find(
            (variant) => variant.params?.login_error === error.code,
        );
        if (!variant)
            throw new Error(`Missing login error ${page.id}/${error.code}`);
        return makeCase(namespace, page, variant, {
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
        });
    });
}

function providerCase(namespace: string, page: CanvasScreen) {
    return makeCase(
        namespace,
        page,
        {},
        {
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
        },
    );
}

function walletCases(namespace: string, page: CanvasScreen) {
    return (page.variants ?? []).flatMap((variant) => {
        if (
            ["Loading", "Load failed", "Session expired"].includes(
                variant.label,
            )
        ) {
            const pending = variant.label === "Loading";
            const expired = variant.label === "Session expired";
            return [
                makeCase(namespace, page, variant, {
                    requests: [
                        {
                            path: "/api/stripe/billing",
                            outcome: pending
                                ? "pending"
                                : expired
                                  ? "unauthorized"
                                  : "unavailable",
                        },
                    ],
                    expected: pending
                        ? [
                              noPageError,
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
                                  text: getDefaultErrorMessage(
                                      expired ? 401 : 503,
                                  ),
                              },
                              {
                                  selector: "button:not(:disabled)",
                                  text: expired ? "Sign in again" : "Try again",
                              },
                              ...(expired
                                  ? [
                                        {
                                            selector:
                                                'body:not(:has(button:text-is("Try again")))',
                                        },
                                    ]
                                  : []),
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
                makeCase(namespace, page, variant, {
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
                        ...(!failed || namespace !== "dashboard"
                            ? [heading("Wallet")]
                            : []),
                        {
                            selector: failed ? "[role='alert']" : "output",
                            text: failed
                                ? getDefaultErrorMessage(503)
                                : credited
                                  ? "Pollen added"
                                  : "Payment hasn’t been credited",
                        },
                        ...(failed
                            ? [{ selector: 'button:text-is("Try again")' }]
                            : [
                                  noPageError,
                                  {
                                      selector: `.polli-wallet-panel-paid .polli-wallet-balance-value:text-is("${credited ? "15" : "10"}")`,
                                  },
                                  {
                                      selector:
                                          '.polli-wallet-panel-tier .polli-wallet-balance-value:text-is("0")',
                                  },
                              ]),
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
                makeCase(namespace, page, variant, {
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
                                          : ("server-error" as const),
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
                                  ? getDefaultErrorMessage(500)
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
                "Billing session expired",
                "Payment action required",
            ].includes(variant.label)
        ) {
            const enabled =
                variant.label === "Auto top-up enabled" ||
                variant.label === "Payment action required";
            const saving = variant.label === "Saving auto top-up",
                failed = variant.label === "Auto top-up save failed";
            const expired = variant.label === "Billing session expired";
            return [
                makeCase(namespace, page, variant, {
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
                            ...(saving || failed || expired
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
                    ...(saving || failed || expired
                        ? {
                              requests: [
                                  {
                                      path: "/api/stripe/auto-top-up",
                                      method: "PATCH",
                                      outcome: saving
                                          ? ("pending" as const)
                                          : expired
                                            ? ("unauthorized" as const)
                                            : ("server-error" as const),
                                  },
                              ],
                          }
                        : {}),
                    expected: saving
                        ? [{ selector: "button:disabled", text: "Save" }]
                        : failed || expired
                          ? [
                                {
                                    selector: '[role="alert"]',
                                    text: getDefaultErrorMessage(
                                        expired ? 401 : 500,
                                    ),
                                },
                                ...(expired
                                    ? [
                                          {
                                              selector: "button:not(:disabled)",
                                              text: "Sign in again",
                                          },
                                      ]
                                    : []),
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
                makeCase(namespace, page, variant, {
                    expected: [
                        heading("Wallet"),
                        noPageError,
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
                makeCase(namespace, page, variant, {
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
                makeCase(namespace, page, variant, {
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
                makeCase(namespace, page, variant, {
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
            return (page.variants ?? []).map((variant) =>
                makeCase("dashboard", page, variant, {
                    conditions: { account: "signed-out" },
                    expected: [...newsContent, newsAccount(false)],
                    ...(variant.params?.action === "sign-in" && {
                        action: {
                            type: "sign-in" as const,
                            outcome:
                                variant.params?.result === "waiting"
                                    ? ("pending" as const)
                                    : ("error" as const),
                        },
                        expected:
                            variant.params?.result === "waiting"
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
            makeCase(
                "dashboard",
                page,
                {},
                {
                    ...(page.id === "news" && {
                        expected: [...newsContent, newsAccount(true)],
                    }),
                    ...(page.id === "account" && {
                        expected: [
                            heading("Profile"),
                            discordDisconnected,
                            ...appsReady,
                        ],
                    }),
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
                        expected: [
                            heading(headings.activity),
                            {
                                selector:
                                    'div:text-is("Requests") + div:text-is("3")',
                            },
                        ],
                    }),
                    ...(page.id === "catalog" && {
                        expected: [
                            heading(headings.catalog),
                            noPageError,
                            {
                                selector:
                                    'button[aria-label^="All, "]:not([aria-label="All, 0 models"])',
                            },
                        ],
                    }),
                    ...(page.id === "quests" && {
                        prepare: { rewards: "available" as const },
                        expected: [
                            { selector: "span", text: "Connect review reward" },
                            { selector: "button", text: "Claim" },
                            questsIdle,
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
                                  ...(/^(key|app)-edit$/.test(page.id)
                                      ? [
                                            {
                                                selector: `[role="dialog"] input[value="${page.id === "key-edit" ? "App example" : "Example app registration"}"]`,
                                            },
                                        ]
                                      : []),
                                  ...(/^(model|agent)-edit$/.test(page.id)
                                      ? [
                                            {
                                                selector: `[role="dialog"] input[name="community-model-title"][value="${page.id === "model-edit" ? "Example model" : "Example agent"}"]`,
                                            },
                                        ]
                                      : []),
                              ],
                          }
                        : {}),
                },
            ),
        ];
        if (["keys", "apps", "models", "agents"].includes(page.id)) {
            const variant = screenVariant(page, {
                params: { collection_case: "empty" },
            });
            if (!variant) throw new Error(`Missing empty list: ${page.id}`);
            cases.push(
                makeCase("dashboard", page, variant, {
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
                makeCase(
                    "dashboard",
                    page,
                    { screen: "dash-news-signed-out" },
                    {
                        conditions: { account: "signed-out" },
                        expected: [...newsContent, newsAccount(false)],
                    },
                ),
            );
        for (const variant of page.variants ?? []) {
            if (
                ["models", "agents", "catalog"].includes(page.id) &&
                ["Loading", "Load failed"].includes(variant.label)
            ) {
                const pending = variant.label === "Loading";
                cases.push(
                    makeCase("dashboard", page, variant, {
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
                            heading(headings[page.id]),
                            ...(pending ? [noPageError] : []),
                            {
                                selector: pending
                                    ? page.id === "catalog"
                                        ? "button[aria-label='All, 0 models']"
                                        : "output, p, span, td, div"
                                    : "[role='alert']",
                                ...(!pending
                                    ? {
                                          text:
                                              page.id === "catalog"
                                                  ? "Could not load models."
                                                  : getDefaultErrorMessage(503),
                                      }
                                    : page.id !== "catalog"
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
                    makeCase("dashboard", page, variant, {
                        prepare: { dashboard: "populated" },
                        requests: [
                            {
                                path,
                                method: "POST",
                                outcome: pending ? "pending" : "server-error",
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
                                selector: "[role='dialog']",
                                text: headings[page.id],
                            },
                            {
                                selector: pending
                                    ? "[role='dialog'] button"
                                    : "[role='dialog'] [role='alert']",
                                ...(pending
                                    ? {
                                          text:
                                              operation === "create"
                                                  ? "Creating"
                                                  : operation === "edit"
                                                    ? "Saving"
                                                    : "Deleting",
                                      }
                                    : {
                                          text:
                                              operation === "delete"
                                                  ? "Couldn’t delete this key. Try again."
                                                  : getDefaultErrorMessage(500),
                                      }),
                            },
                        ],
                    }),
                );
            }
        }
        for (const variant of page.variants ?? []) {
            const label = variant.label;
            if (
                label === "Created · copy key" &&
                /^(key|app)-create$/.test(page.id)
            )
                cases.push(
                    makeCase("dashboard", page, variant, {
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
                    makeCase("dashboard", page, variant, {
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
                if (
                    ["discord-check-error", "discord-lookup-error"].includes(
                        variant.params?.settings_case ?? "",
                    )
                ) {
                    const lookup =
                        variant.params?.settings_case ===
                        "discord-lookup-error";
                    cases.push(
                        makeCase("dashboard", page, variant, {
                            ...(lookup && {
                                prepare: { discord: "connected" as const },
                            }),
                            requests: [
                                {
                                    path: lookup
                                        ? "/api/auth/account-info"
                                        : "/api/auth/list-accounts",
                                    outcome: "server-error",
                                },
                            ],
                            expected: [
                                ...appsReady,
                                {
                                    selector: `${discordSection} [role="alert"]`,
                                    text: getDefaultErrorMessage(500),
                                },
                                {
                                    selector: `${discordSection} button:text-is("${lookup ? "Disconnect Discord" : "Connect Discord"}"):enabled`,
                                },
                                ...(lookup
                                    ? [
                                          {
                                              selector: `${discordSection} p`,
                                              text: "Discord ID: 100000000000000001",
                                          },
                                          {
                                              selector: `${discordSection}:not(:has(p:has-text("@connect-review")))`,
                                          },
                                      ]
                                    : []),
                            ],
                        }),
                    );
                    continue;
                }
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
                    makeCase("dashboard", page, variant, {
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
                                        : ("server-error" as const),
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
                            ...appsReady,
                            {
                                selector: `${discordSection} button${pending ? ":disabled" : ":enabled"}:text-is("${pending ? "Working..." : connect ? "Connect Discord" : "Disconnect Discord"}")`,
                            },
                            ...(!connect
                                ? [
                                      {
                                          selector: `${discordSection} p`,
                                          text: "Discord ID: 100000000000000001",
                                      },
                                  ]
                                : []),
                            ...(label === "Discord identity unavailable"
                                ? [
                                      {
                                          selector: `${discordSection} [role="alert"]`,
                                          text: "Could not load your connected account's details. Please try again.",
                                      },
                                  ]
                                : idle || pending
                                  ? [
                                        {
                                            selector: `${discordSection}:not(:has([role="alert"]))`,
                                        },
                                    ]
                                  : [
                                        {
                                            selector: `${discordSection} [role="alert"]`,
                                            text: getDefaultErrorMessage(500),
                                        },
                                    ]),
                            ...(label === "Discord identity unavailable"
                                ? [
                                      {
                                          selector: `${discordSection}:not(:has(p:has-text("@connect-review")))`,
                                      },
                                  ]
                                : !connect
                                  ? [
                                        {
                                            selector: `${discordSection} p`,
                                            text: "@connect-review",
                                        },
                                    ]
                                  : []),
                        ],
                    }),
                );
            }
            if (label === "Public publishing")
                cases.push(
                    makeCase("dashboard", page, variant, {
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
                    makeCase("dashboard", page, variant, {
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
                    makeCase("dashboard", page, variant, {
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
                                        : ("server-error" as const),
                                },
                            ],
                            steps: [
                                {
                                    selector: `#connectors button[aria-label="${connected ? "Disconnect" : "Connect"} GitHub"]`,
                                    action: "click",
                                },
                            ],
                        }),
                        expected: [
                            discordDisconnected,
                            appsLoaded,
                            ...(connected ? connectedApps : availableApps),
                            appsAlert(
                                label === "App connected" || pending
                                    ? undefined
                                    : getDefaultErrorMessage(500),
                            ),
                            {
                                selector: `${appsSection} button[aria-label="${connected ? "Disconnect" : "Connect"} GitHub"]${pending ? ":disabled" : ":enabled"}`,
                                text: pending
                                    ? connected
                                        ? "Disconnecting..."
                                        : "Connecting..."
                                    : connected
                                      ? "Disconnect"
                                      : "Connect",
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
                    makeCase("dashboard", page, variant, {
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
                                outcome: pending ? "pending" : "server-error",
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
                                selector: "[role='dialog']",
                                text: headings[page.id],
                            },
                            {
                                selector: pending
                                    ? "[role='dialog'] button"
                                    : testing
                                      ? "[role='dialog'] p.text-intent-danger-text"
                                      : "[role='dialog'] [role='alert']",

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
                                    : { text: getDefaultErrorMessage(500) }),
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
                    makeCase("dashboard", page, variant, {
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
                    makeCase("dashboard", page, variant, {
                        prepare: { dashboard: "populated", listing: "queued" },
                        expected: [
                            { selector: "[role='dialog']", text: "queued" },
                        ],
                    }),
                );
            if (page.id === "agent-edit" && label === "Endpoint agent")
                cases.push(
                    makeCase("dashboard", page, variant, {
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
            if (
                page.id === "quests" &&
                screenVariantId(page, variant) !== "default"
            ) {
                const loading = label === "Loading",
                    failed = label === "Load failed",
                    checking = label === "Checking quests",
                    checkFailed = label === "Check unavailable";
                const claiming = label === "Claiming",
                    claimFailed = label === "Claim failed";
                const pending = loading || checking || claiming;
                const requestFailed = failed || checkFailed || claimFailed;
                cases.push(
                    makeCase("dashboard", page, variant, {
                        prepare: {
                            rewards:
                                label === "No earned rewards"
                                    ? "empty"
                                    : label === "Reward claimed"
                                      ? "claimed"
                                      : "available",
                        },
                        requests:
                            pending || requestFailed
                                ? [
                                      {
                                          path:
                                              loading || failed
                                                  ? "/api/quests/rewards"
                                                  : claiming || claimFailed
                                                    ? "/api/quests/rewards/*/claim"
                                                    : "/api/quests/check",
                                          method:
                                              loading || failed
                                                  ? "GET"
                                                  : "POST",
                                          outcome: pending
                                              ? "pending"
                                              : failed
                                                ? "unavailable"
                                                : "server-error",
                                      },
                                  ]
                                : [],
                        ...(claiming || claimFailed
                            ? {
                                  steps: [
                                      {
                                          selector:
                                              "button:not(.pointer-events-none button)",
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
                                            ? "Failed to claim reward (500)"
                                            : checkFailed
                                              ? "Connect review reward"
                                              : label === "Reward claimed"
                                                ? "Connect review reward"
                                                : "Setup",
                            },
                            ...(!pending && !failed && !claimFailed
                                ? [questsIdle]
                                : []),
                            ...(pending
                                ? [
                                      {
                                          selector:
                                              "body:not(:has(.text-intent-danger-text))",
                                      },
                                  ]
                                : []),
                            ...(checkFailed
                                ? [{ selector: 'button:text-is("Claim")' }]
                                : []),
                            ...(label === "Reward claimed"
                                ? [
                                      {
                                          selector:
                                              'body:not(:has(button:text-is("Claim")))',
                                      },
                                      {
                                          selector:
                                              '.polli-wallet-panel-tier span:text-is("5")',
                                      },
                                  ]
                                : []),
                            ...(label === "No earned rewards"
                                ? [
                                      {
                                          selector:
                                              'body:not(:has(span:text-is("Connect review reward"))):not(:has(button:text-is("Claim")))',
                                      },
                                  ]
                                : []),
                        ],
                    }),
                );
            }
            if (
                page.id === "activity" &&
                ["Loading", "Load failed"].includes(label)
            )
                cases.push(
                    makeCase("dashboard", page, variant, {
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
                [
                    "loading",
                    "error",
                    "toolkits-loading",
                    "toolkits-error",
                ].includes(variant.params?.settings_case ?? "")
            ) {
                const toolkits =
                    variant.params?.settings_case?.startsWith("toolkits-");
                const pending =
                    variant.params?.settings_case?.endsWith("loading");
                const status = toolkits
                    ? "Loading apps…"
                    : "Loading connected apps…";
                const error = getDefaultErrorMessage(503);
                cases.push(
                    makeCase("dashboard", page, variant, {
                        requests: [
                            {
                                path: toolkits
                                    ? "/api/account/integrations/toolkits"
                                    : "/api/account/integrations",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        expected: [
                            discordDisconnected,
                            appsAlert(pending ? undefined : error),
                            ...(toolkits
                                ? [
                                      {
                                          selector: `${appsSection}:not(:has(button[aria-label="Connect GitHub"])):not(:has(button[aria-label="Disconnect GitHub"])) input[aria-label="Search available apps"]`,
                                      },
                                  ]
                                : availableApps),
                            pending
                                ? {
                                      selector: `${appsSection} [role="status"]:text-is("${status}")`,
                                  }
                                : appsLoaded,
                            {
                                selector: `${appsSection}:not(:has([role="status"]:not(:text-is("${status}"))))`,
                            },
                        ],
                    }),
                );
            }
            if (
                page.id === "account-delete" &&
                screenVariantId(page, variant) !== "default"
            )
                cases.push(
                    makeCase("dashboard", page, variant, {
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
                                                  : ("server-error" as const),
                                      },
                                  ],
                              }),
                        expected: [
                            {
                                selector:
                                    label === "Acknowledged"
                                        ? "[role='dialog'] button:not(:disabled)"
                                        : label === "Deleting"
                                          ? "[role='dialog'] button"
                                          : "[role='dialog'] [data-scope='field'][data-part='error-text']",
                                text:
                                    label === "Acknowledged"
                                        ? "Delete account"
                                        : label === "Deleting"
                                          ? "Deleting"
                                          : getDefaultErrorMessage(500),
                            },
                            {
                                selector: "[role='dialog']",
                                text: headings[page.id],
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
            return (page.variants ?? []).map((variant) =>
                makeCase("topup", page, variant, {
                    ...(variant.params?.sim_budget !== "0" && {
                        title: page.title,
                    }),
                    conditions: {
                        account: "signed-in",
                        allowance:
                            variant.params?.sim_budget === "0"
                                ? "exhausted"
                                : "available",
                    },
                    query: { screen: "add-pollen-connect" },
                    steps: [
                        {
                            selector: "button",
                            text: "Connect with Pollinations",
                            action: "click",
                        },
                        ...(variant.params?.sim_budget === "0"
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
                        ...(variant.params?.sim_budget === "0"
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
        return (page.variants ?? []).flatMap((variant) => {
            if (["Loading", "Load failed"].includes(variant.label)) {
                const pending = variant.label === "Loading";
                return [
                    makeCase("topup", page, variant, {
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
                    makeCase("topup", page, variant, {
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
                                            : ("server-error" as const),
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
                                            text: getDefaultErrorMessage(500),
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
            if (screenVariantId(page, variant) === "default")
                return [
                    makeCase("topup", page, variant, {
                        prepare: { dashboard: "populated" },
                    }),
                ];
            if (variant.label === "Sign in")
                return [
                    makeCase("topup", page, variant, {
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
                    makeCase("topup", page, variant, {
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
                    makeCase("topup", page, variant, {
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
