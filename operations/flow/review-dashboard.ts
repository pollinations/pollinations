import { getDefaultErrorMessage } from "@shared/error.ts";
import { accountActionScreens } from "./flow-account-actions";
import {
    type CanvasScreen,
    type ScreenVariant,
    screenVariant,
    screenVariantId,
} from "./flow-canvas-data";
import { dashboardScreens, dashboardSectionForScreen } from "./flow-dashboard";
import { loginSituations } from "./review-auth";
import type { ReviewCase } from "./review-cases";

type DashboardReviewCase = ReviewCase;

const headings: Record<string, string> = {
    "enter-signed-out": "Announcements",
    "enter-connected": "Wallet",
    news: "Announcements",
    catalog: "Models",
    activity: "Usage",
    quests: "Quests",
    account: "Profile",
    "account-delete": "Delete Pollinations account?",
    keys: "Secrets",
    apps: "Apps",
    models: "Models",
    agents: "Agents",
    "key-create": "Create secret key",
    "key-edit": "Edit secret key",
    "key-delete": "Delete secret key?",
    "app-create": "Create app key",
    "app-edit": "Edit app key",
    "app-delete": "Delete app key?",
    "model-create": "Create model",
    "model-edit": "Edit model",
    "model-delete": "Delete model?",
    "model-visibility": "Unlist model?",
    "agent-create": "Create agent",
    "agent-edit": "Edit agent",
    "agent-delete": "Delete agent?",
    "agent-visibility": "Unlist agent?",
    "account-key": "App access",
    "account-wallet": "Top-up",
};
const heading = (text: string) => ({ selector: "h1, h2, h3", text });
const newsContent = [
    heading("Announcements"),
    { selector: "#canonical-model-slugs" },
    heading("News"),
    heading("FAQ"),
];
const noPageError = { selector: 'body:not(:has([role="alert"]))' };
const appsSection = 'section:has(h2:text-is("Connected apps"))';
const discordSection = 'section:has(h2:text-is("Community"))';
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
    { selector: `${appsSection} p:text-is("Flow review")` },
    { selector: `${appsSection} p:text-is("Code and repositories.")` },
    { selector: `${appsSection} button[aria-label="Disconnect GitHub"]` },
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
        'body:not(:has([role="alert"])):not(:has(output:has-text("Refreshing quests")))',
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
    keys: { populated: "App example", empty: "Create secret key" },
    apps: {
        populated: "Example app registration",
        empty: "Create app key",
    },
    models: { populated: "Example model", empty: "Create model" },
    agents: { populated: "Example agent", empty: "Create agent" },
};
const collectionAnchors: Record<string, string> = {
    keys: "api-keys",
    apps: "app-keys",
    models: "models",
    agents: "agents",
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
    return Object.values(loginSituations).map((error) => {
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
                    error.id === loginSituations.banned.id
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
    const dashboard = namespace === "dashboard";
    const title = heading(dashboard ? "Wallet" : "Top-up");
    const buy = { selector: 'a[href^="/api/stripe/checkout/"]', text: "Buy" };
    const billingError = {
        selector: '[role="alert"]',
        text: "Couldn’t load billing settings.",
    };
    const retry = { selector: "button:enabled", text: "Try again" };
    const balance = (paid: string, quest: string) =>
        dashboard
            ? [
                  {
                      selector: `.polli-wallet-panel-paid .polli-wallet-balance-value:text-is("${paid}")`,
                  },
                  {
                      selector: `.polli-wallet-panel-tier .polli-wallet-balance-value:text-is("${quest}")`,
                  },
              ]
            : paid === "0" && quest === "0"
              ? [{ selector: '[aria-label="No Pollen"]' }]
              : [
                    {
                        selector: 'span:has(> span:text-is("Paid Pollen:"))',
                        text: `Paid Pollen: ${paid}`,
                    },
                    {
                        selector: 'span:has(> span:text-is("Quest Pollen:"))',
                        text: `Quest Pollen: ${quest}`,
                    },
                ];
    return (page.variants ?? []).map((variant) => {
        const accountCase = variant.params?.account_case;
        const make = (recipe: Partial<ReviewCase>) =>
            makeCase(namespace, page, variant, recipe);
        if (
            [
                "loading",
                "load-error",
                "session-expired",
                "billing-loading",
                "billing-error",
            ].includes(accountCase ?? "")
        ) {
            const billing = accountCase?.startsWith("billing-");
            const pending = accountCase?.endsWith("loading");
            return make({
                requests: [
                    {
                        path: billing
                            ? "/api/stripe/billing"
                            : "/api/customer/balance",
                        outcome: pending
                            ? "pending"
                            : accountCase === "session-expired"
                              ? "unauthorized"
                              : "unavailable",
                    },
                ],
                note: pending
                    ? dashboard
                        ? billing
                            ? "Billing is held. On initial navigation, main shows the dashboard shell but leaves its main content blank."
                            : "Balance is held. On initial navigation, main leaves the entire dashboard blank with no loading indicator."
                        : billing
                          ? "Billing is held. Main leaves the purchase section empty while balances remain visible."
                          : "Balance is held. Main shows its Top-up loading screen."
                    : accountCase === "session-expired"
                      ? "The balance request returns an injected 401. Main shows the same generic load error and Try again; it offers no sign-in recovery here."
                      : "Main replaces the endpoint error with this resource’s generic load message.",
                expected:
                    pending && dashboard
                        ? [
                              {
                                  selector: billing
                                      ? "body:has(main:empty)"
                                      : 'body:has(#root:empty):not(:has([role="alert"]))',
                              },
                          ]
                        : [
                              title,
                              ...(pending
                                  ? [
                                        noPageError,
                                        ...(billing
                                            ? [
                                                  ...balance("10", "0"),
                                                  {
                                                      selector:
                                                          'body:not(:has(a[href^="/api/stripe/checkout/"]))',
                                                  },
                                              ]
                                            : [
                                                  {
                                                      selector: "output",
                                                      text: "Loading…",
                                                  },
                                              ]),
                                    ]
                                  : [
                                        billing
                                            ? billingError
                                            : {
                                                  selector: '[role="alert"]',
                                                  text: dashboard
                                                      ? "Couldn’t load your balance."
                                                      : "Couldn’t load your wallet.",
                                              },
                                        retry,
                                        ...(billing
                                            ? [buy, ...balance("10", "0")]
                                            : dashboard
                                              ? [buy]
                                              : []),
                                    ]),
                          ],
            });
        }
        if (accountCase === "checkout-return" || accountCase === "canceled") {
            const success = accountCase === "checkout-return";
            return make({
                query: { screen: pageRoute(page), account_case: accountCase },
                note: success
                    ? "Only the checkout return URL is supplied. No payment or credit is simulated. Main does not query checkout status." +
                      (dashboard
                          ? " The dashboard shows its ordinary wallet, with no payment-confirmation message."
                          : " The standalone page says Pollen will appear when Stripe confirms payment.")
                    : dashboard
                      ? "Main’s dashboard ignores the checkout-canceled flag and shows its ordinary wallet."
                      : "The canceled return URL displays main’s retry-purchase message.",
                expected: [
                    title,
                    ...balance("10", "0"),
                    ...(dashboard
                        ? [buy, noPageError]
                        : success
                          ? [
                                {
                                    selector: "p",
                                    text: "Your Pollen will appear when Stripe confirms the payment.",
                                },
                                {
                                    selector: 'a[href$="/flow-example.html"]',
                                    text: "Back to",
                                },
                                {
                                    selector:
                                        'body:not(:has(a[href^="/api/stripe/checkout/"]))',
                                },
                            ]
                          : [
                                buy,
                                {
                                    selector: '[role="alert"]',
                                    text: "Checkout was cancelled. Choose an amount to try again.",
                                },
                            ]),
                ],
            });
        }
        if (["Paid available", "Quest only", "Empty"].includes(variant.label))
            return make({
                conditions: {
                    account: "signed-in",
                    pollen:
                        variant.label === "Empty"
                            ? "empty"
                            : variant.label === "Quest only"
                              ? "quest"
                              : "paid",
                },
                expected: [
                    title,
                    noPageError,
                    buy,
                    ...balance(
                        variant.label === "Paid available" ? "10" : "0",
                        variant.label === "Quest only" ? "5" : "0",
                    ),
                ],
            });
        if (variant.label === "Sign in")
            return make({
                conditions: { account: "signed-out" },
                expected: [
                    title,
                    { selector: "button", text: "Sign in with GitHub" },
                ],
            });
        if (variant.label === "Starting sign-in failed")
            return make({
                conditions: { account: "signed-out" },
                action: { type: "sign-in", outcome: "error" },
                expected: [
                    title,
                    {
                        selector: '[role="alert"]',
                        text: "We couldn’t sign you in to your Pollinations account. Please try again.",
                    },
                ],
            });
        const portal = variant.params?.action === "billing-portal";
        const save = variant.params?.action === "billing-save";
        const pending = variant.params?.result === "waiting";
        const expired = variant.params?.result === "session-expired";
        const failed = variant.params?.result === "error" || expired;
        const setup = variant.label === "Auto top-up setup";
        const payment = variant.label === "Payment action required";
        const lastCharge = variant.label === "Last charge failed";
        const enabled =
            portal ||
            payment ||
            lastCharge ||
            variant.label === "Auto top-up enabled";
        return make({
            ...(!setup && {
                prepare: {
                    billing: payment
                        ? "payment-action"
                        : enabled
                          ? "enabled"
                          : "ready",
                    ...(lastCharge && { payment: "failed" }),
                },
            }),
            note:
                "Stripe customer, card and invoice responses are explicit local external-service fixtures; Enter reads its real billing records. No checkout or charge is performed." +
                (failed
                    ? " Main drops the injected nested error.message and shows its action’s generic error; a 401 does not offer sign-in recovery."
                    : pending && save
                      ? " Main disables the switch while saving, but its Save button remains enabled."
                      : ""),
            steps: [
                ...(!enabled
                    ? [
                          {
                              selector:
                                  '[role="switch"][aria-label$="auto top-up"]',
                              action: "click" as const,
                          },
                      ]
                    : []),
                ...(portal || save
                    ? [
                          {
                              selector: "button",
                              text: portal ? "Manage billing" : "Save",
                              action: "click" as const,
                          },
                      ]
                    : []),
            ],
            ...(portal || save
                ? {
                      requests: [
                          {
                              path: portal
                                  ? "/api/stripe/billing/portal"
                                  : "/api/stripe/auto-top-up",
                              method: portal ? "POST" : "PATCH",
                              outcome: pending
                                  ? "pending"
                                  : expired
                                    ? "unauthorized"
                                    : "server-error",
                          },
                      ],
                  }
                : {}),
            expected: [
                title,
                buy,
                ...(failed
                    ? [
                          {
                              selector: '[role="alert"]',
                              text: portal
                                  ? "Failed to open Stripe"
                                  : "Failed to save auto top-up",
                          },
                          {
                              selector: "button:enabled",
                              text: portal ? "Manage billing" : "Save",
                          },
                      ]
                    : pending
                      ? portal
                          ? [
                                {
                                    selector: "button:disabled",
                                    text: "Opening...",
                                },
                            ]
                          : [
                                {
                                    selector:
                                        '[role="switch"][aria-label$="auto top-up"]:disabled',
                                },
                                { selector: "button:enabled", text: "Save" },
                            ]
                      : payment
                        ? [
                              {
                                  selector:
                                      'a[href="https://billing.example.invalid/flow-review"]',
                                  text: "complete in Stripe",
                              },
                          ]
                        : lastCharge
                          ? [
                                {
                                    selector: "div",
                                    text: "Last charge failed — update card",
                                },
                            ]
                          : setup
                            ? [
                                  {
                                      selector: "div",
                                      text: "Add your payment method",
                                  },
                                  {
                                      selector: "button",
                                      text: "Manage billing",
                                  },
                              ]
                            : enabled
                              ? [
                                    {
                                        selector:
                                            '[role="switch"][aria-label$="auto top-up"][aria-checked="true"]',
                                    },
                                ]
                              : [{ selector: "button:enabled", text: "Save" }]),
            ],
        });
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
                                          text: loginSituations.default.message,
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
                        note: "Account settings runs real Enter code. Available apps and Discord identity responses are local external-provider fixtures; no live connection is established.",
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
                            heading("Earnings"),
                            {
                                selector:
                                    'table[aria-label="Usage by model"] tbody tr:has-text("openai") [aria-label="0.02 Paid Pollen"]',
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
                        note: "The bonus reward is a seeded local ledger row. Catalog, automatic checks and claims use real Enter code with local GitHub and Tinybird fixtures; this is not production reward evidence.",
                        prepare: { rewards: "available" as const },
                        expected: [
                            { selector: "div", text: "Flow review reward" },
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
                        {
                            selector: `button[aria-label="${listContent[page.id].empty}"]`,
                        },
                        {
                            selector: `#${collectionAnchors[page.id]}:not(:has(button[aria-label^='Edit '], button[title^='Edit ']))`,
                        },
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
                                        : page.id === "agents"
                                          ? "/api/account/agents"
                                          : "/api/account/my-models",
                                outcome: pending ? "pending" : "unavailable",
                            },
                        ],
                        ...(page.id !== "catalog" && pending
                            ? {
                                  note: "Main renders no loading content for Models or Agents while either list request is pending. The dashboard shell remains visible.",
                              }
                            : {}),
                        expected:
                            page.id !== "catalog" && pending
                                ? [
                                      {
                                          selector:
                                              '#root:not(:has(h2:text-is("Models"))):not(:has(h2:text-is("Agents"))):not(:has([role="alert"]))',
                                      },
                                  ]
                                : [
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
                                                            : getDefaultErrorMessage(
                                                                  503,
                                                              ),
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
                                              "[role='dialog'] input[placeholder='Secret name'], [role='dialog'] input[placeholder='App name']",
                                          action: "fill" as const,
                                          value: "Flow review",
                                      },
                                  ]
                                : []),
                            {
                                selector: "button",
                                text:
                                    operation === "create"
                                        ? headings[page.id]
                                        : operation === "edit"
                                          ? "Save changes"
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
                                                  ? `Couldn’t delete ${page.id === "app-delete" ? "the app key" : "the secret key"}.`
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
                                    "[role='dialog'] input[placeholder='Secret name'], [role='dialog'] input[placeholder='App name']",
                                action: "fill",
                                value:
                                    page.id === "key-create"
                                        ? "FLOW_REVIEW_API_KEY"
                                        : "FLOW_REVIEW_APP_KEY",
                            },
                            {
                                selector: "button",
                                text: headings[page.id],
                                action: "click",
                            },
                        ],
                        expected: [
                            {
                                selector: "[role='dialog']",
                                text:
                                    page.id === "app-create"
                                        ? "App key created"
                                        : "Secret key created",
                            },
                            {
                                selector: "[role='dialog'] button",
                                text: "Copy and close",
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
            if (
                page.id === "account" &&
                [
                    "Loading profile",
                    "Profile unavailable",
                    "Signing out",
                    "Sign-out failed",
                ].includes(label)
            ) {
                const profile =
                    label.includes("profile") ||
                    label === "Profile unavailable";
                const pending =
                    label === "Loading profile" || label === "Signing out";
                cases.push(
                    makeCase("dashboard", page, variant, {
                        requests: [
                            {
                                path: profile
                                    ? "/api/account/profile"
                                    : "/api/auth/sign-out",
                                ...(profile ? {} : { method: "POST" as const }),
                                outcome: pending ? "pending" : "server-error",
                            },
                        ],
                        ...(!profile && {
                            steps: [
                                {
                                    selector: "button",
                                    text: "Sign out",
                                    action: "click" as const,
                                },
                            ],
                        }),
                        note: "Main leaves the dashboard content empty while profile data loads and offers Try again on a failed profile read. Sign-out faults are intercepted before session revocation and show generic recovery copy.",
                        expected:
                            profile && pending
                                ? [{ selector: "body:has(main:empty)" }]
                                : [
                                      heading("Profile"),
                                      ...appsReady,
                                      ...(profile
                                          ? [
                                                {
                                                    selector: `${discordSection} [role="alert"]`,
                                                    text: "Couldn’t load connection settings.",
                                                },
                                                {
                                                    selector: `${discordSection} button:text-is("Try again")`,
                                                },
                                            ]
                                          : [
                                                discordDisconnected,
                                                {
                                                    selector: `button:text-is("${pending ? "Signing out…" : "Sign out"}")${pending ? ":disabled" : ":enabled"}`,
                                                },
                                                ...(pending
                                                    ? [
                                                          {
                                                              selector:
                                                                  'body:not(:has([role="alert"]:visible))',
                                                          },
                                                      ]
                                                    : [
                                                          {
                                                              selector:
                                                                  '[role="alert"]',
                                                              text: "Couldn’t sign out. Please try again.",
                                                          },
                                                      ]),
                                            ]),
                                  ],
                    }),
                );
                continue;
            }
            if (
                page.id === "quests" &&
                (variant.params?.quest_catalog || variant.params?.quest_rewards)
            ) {
                const catalog = Boolean(variant.params.quest_catalog);
                const pending = variant.params.quest_catalog === "loading";
                cases.push(
                    makeCase("dashboard", page, variant, {
                        prepare: { rewards: "available" },
                        requests: [
                            {
                                path: catalog
                                    ? "/api/quests/catalog"
                                    : "/api/quests/rewards",
                                outcome: pending
                                    ? "pending"
                                    : catalog
                                      ? "unavailable"
                                      : "unauthorized",
                            },
                        ],
                        note: catalog
                            ? "Main has no retry control for a failed initial quest load. The HTTP fault is injected before Enter handles the request."
                            : "Main treats a 401 from rewards as an anonymous preview even while the dashboard session remains signed in. No reward or wallet change is simulated.",
                        expected: catalog
                            ? [
                                  {
                                      selector: pending
                                          ? "output"
                                          : '[role="alert"]',
                                      text: pending
                                          ? "Loading quests"
                                          : "Failed to load quests (503)",
                                  },
                              ]
                            : [
                                  heading("Pollen you can earn"),
                                  {
                                      selector:
                                          'body:not(:has(button:text-is("Claim")))',
                                  },
                                  noPageError,
                              ],
                    }),
                );
                continue;
            }
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
                            note: lookup
                                ? "Main retains the Discord ID but silently drops profile details when account-info fails. The injected Better Auth fault is not an endpoint-generated failure."
                                : "Main replaces the Better Auth error with generic, non-alert text and offers Connect, not a list retry. The fault is injected.",
                            expected: [
                                ...appsReady,
                                ...(lookup
                                    ? [
                                          {
                                              selector: `${discordSection}:not(:has([role="alert"]))`,
                                          },
                                      ]
                                    : [
                                          {
                                              selector: `${discordSection} p`,
                                              text: "Could not load connected accounts.",
                                          },
                                      ]),
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
                                              selector: `${discordSection}:not(:has(p:has-text("@flow-review")))`,
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
                        note: "Discord identity data is a local external-provider fixture. Main shows generic non-alert text for link/unlink failures and no error for unavailable identity details. Writes are intercepted before Better Auth; no credential is created or revoked.",
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
                            ...(idle || pending
                                ? [
                                      {
                                          selector: `${discordSection}:not(:has([role="alert"]))`,
                                      },
                                  ]
                                : [
                                      {
                                          selector: `${discordSection} p`,
                                          text: connect
                                              ? "Could not connect Discord."
                                              : "Could not disconnect Discord.",
                                      },
                                  ]),
                            ...(label === "Discord identity unavailable"
                                ? [
                                      {
                                          selector: `${discordSection}:not(:has(p:has-text("@flow-review")))`,
                                      },
                                  ]
                                : !connect
                                  ? [
                                        {
                                            selector: `${discordSection} p`,
                                            text: "@flow-review",
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
                                    : "h2",
                                text: /-(create|edit)$/.test(page.id)
                                    ? "Public"
                                    : "Publisher info",
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
                        note: "Connected apps use explicit local Composio fixtures. Main replaces HTTP errors with generic copy; write faults stop before the provider and do not create or revoke connections.",
                        expected: [
                            discordDisconnected,
                            appsLoaded,
                            ...(connected ? connectedApps : availableApps),
                            appsAlert(
                                label === "App connected" || pending
                                    ? undefined
                                    : connected
                                      ? "Could not disconnect this app."
                                      : "Could not connect this app.",
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
            if (variant.params?.agent_kind === "code") {
                const creating = page.id === "agent-create";
                const action = variant.params.action;
                const pending = variant.params.result === "waiting";
                const syncing = action === "sync";
                cases.push(
                    makeCase("dashboard", page, variant, {
                        prepare: {
                            dashboard: "populated",
                            ...(!creating && { listing: "code-agent" }),
                        },
                        note: "Code-agent review uses local metadata only; no code is deployed. Submitting and sync situations hold or fail the request before Enter calls GitHub or the deployment service.",
                        ...(action && {
                            requests: [
                                {
                                    path: creating
                                        ? "/api/account/agents"
                                        : syncing
                                          ? "/api/account/agents/*/sync"
                                          : "/api/account/agents/*",
                                    method:
                                        creating || syncing ? "POST" : "PATCH",
                                    outcome: pending
                                        ? "pending"
                                        : "server-error",
                                },
                            ],
                        }),
                        steps: [
                            ...(creating
                                ? [
                                      {
                                          selector: "[role='dialog'] button",
                                          text: "Code agent",
                                          action: "click" as const,
                                      },
                                  ]
                                : []),
                            ...(creating && action
                                ? [
                                      {
                                          selector:
                                              "input[name='code-agent-repository']",
                                          value: "https://github.com/flow-review/example-agent",
                                          action: "fill" as const,
                                      },
                                  ]
                                : []),
                            ...(action
                                ? [
                                      {
                                          selector: "[role='dialog'] button",
                                          text: creating
                                              ? "Create agent"
                                              : syncing
                                                ? "Sync from GitHub"
                                                : "Save changes",
                                          action: "click" as const,
                                      },
                                  ]
                                : []),
                        ],
                        expected: [
                            {
                                selector: "[role='dialog']",
                                text: headings[page.id],
                            },
                            {
                                selector:
                                    "[role='dialog'] input[name='code-agent-repository']",
                            },
                            ...(action
                                ? [
                                      {
                                          selector: pending
                                              ? "[role='dialog'] button:disabled"
                                              : "[role='dialog'] [role='alert']",
                                          text: pending
                                              ? creating
                                                  ? "Creating…"
                                                  : syncing
                                                    ? "Syncing…"
                                                    : "Saving…"
                                              : getDefaultErrorMessage(500),
                                      },
                                  ]
                                : []),
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
                const section = agent ? "agents" : "models";
                const returnsToList = op === "delete" || op === "visibility";
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
                        ? "Unlist"
                        : op === "edit"
                          ? "Save changes"
                          : `Create ${kind}`;
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
                                            "https://flow-review.invalid/v1/chat/completions",
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
                        ...(returnsToList && {
                            note: `Main closes this confirmation before the request finishes. ${op === "delete" ? "The item stays in the list and has no pending indicator; failures appear above the lists." : "The list's visibility control is disabled while saving; failures appear above the lists."}`,
                        }),
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
                        expected: returnsToList
                            ? [
                                  heading(headings[section]),
                                  {
                                      selector:
                                          'body:not(:has([role="dialog"][data-state="open"]))',
                                  },
                                  {
                                      selector: `#${section}`,
                                      text: listContent[section].populated,
                                  },
                                  ...(pending
                                      ? [
                                            noPageError,
                                            ...(op === "visibility"
                                                ? [
                                                      {
                                                          selector: `#${section} button[aria-label="Saving visibility"]:disabled`,
                                                      },
                                                  ]
                                                : []),
                                        ]
                                      : [
                                            {
                                                selector: '[role="alert"]',
                                                text: getDefaultErrorMessage(
                                                    500,
                                                ),
                                            },
                                        ]),
                              ]
                            : [
                                  {
                                      selector: "[role='dialog']",
                                      text: headings[page.id],
                                  },
                                  {
                                      selector: pending
                                          ? "[role='dialog'] button:disabled"
                                          : testing
                                            ? "[role='dialog'] p.text-intent-danger-text"
                                            : "[role='dialog'] [role='alert']",

                                      ...(pending
                                          ? {
                                                text: testing
                                                    ? "Testing"
                                                    : op === "create"
                                                      ? "Creating"
                                                      : "Saving",
                                            }
                                          : {
                                                text: getDefaultErrorMessage(
                                                    500,
                                                ),
                                            }),
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
                                ...(form
                                    ? { text: "Relist" }
                                    : {
                                          selector: `#${page.id} button[aria-label="Relist ${page.id === "agents" ? "agent" : "model"}"]`,
                                      }),
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
                            heading("Edit endpoint agent"),
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
                        note: "Quests use the real Enter catalog, checker and reward ledger with local GitHub/Tinybird fixtures. Claimed is seeded ledger state, not proof of a claim. Main silently keeps cached rewards after a failed automatic check; initial load errors have no retry, and claim errors use generic copy.",
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
                                        : "p, span, button, div, output",
                                text: loading
                                    ? "Loading quests"
                                    : failed
                                      ? "Failed to load quests"
                                      : checking
                                        ? "Refreshing quests"
                                        : claiming
                                          ? "Claiming"
                                          : claimFailed
                                            ? "Couldn’t claim the reward. Please try again."
                                            : checkFailed
                                              ? "Flow review reward"
                                              : label === "Reward claimed"
                                                ? "Flow review reward"
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
                                              'section:has(h2:text-is("Bonus rewards")):not(:has(button:text-is("Claim")))',
                                      },
                                  ]
                                : []),
                            ...(label === "No earned rewards"
                                ? [
                                      {
                                          selector:
                                              'body:not(:has(div:text-is("Flow review reward"))):not(:has(button:text-is("Claim")))',
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
                const error = toolkits
                    ? "Could not load available apps."
                    : "Could not load connected apps.";
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
                        note: "Main leaves the apps list blank while loading. A failed read shows generic copy without a retry button. This HTTP fault is injected; Composio results are local fixtures.",
                        expected: [
                            discordDisconnected,
                            appsAlert(pending ? undefined : error),
                            {
                                selector: `${appsSection}:not(:has(button[aria-label="Connect GitHub"])):not(:has(button[aria-label="Disconnect GitHub"])) input[aria-label="Search apps"]`,
                            },
                            appsLoaded,
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
                        { selector: "[data-flow-state='connected']" },
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
                                text: loginSituations.default.title,
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
