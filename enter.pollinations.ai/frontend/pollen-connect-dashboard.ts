import { loginErrors } from "@shared/auth/login-errors.ts";
import type { CanvasScreen } from "./pollen-connect-canvas-data";
import type { FlowEdge, FlowNode } from "./pollen-connect-diagram";
import { walletBillingVariants } from "./pollen-connect-wallet-preview";

const operationStates = (action: string, pending: string) => [
    { label: pending, params: { action, result: "waiting" } },
    {
        label: "Request failed",
        error: true,
        params: { action, result: "error" },
    },
];

// The same inventory drives route fixtures, Screens, Map and Journey.
export const dashboardScreens: CanvasScreen[] = [
    {
        id: "enter-signed-out",
        title: "Dashboard sign-in",
        owner: "Pollinations",
        screen: "dash-sign-in",
        variants: [
            { label: "Sign in" },
            ...operationStates("sign-in", "Signing in"),
        ],
    },
    {
        id: "dashboard-github",
        title: "Continue on GitHub",
        owner: "GitHub",
        screen: "dash-github",
    },
    {
        id: "dashboard-auth-error",
        title: "Pollinations sign-in error",
        owner: "Pollinations",
        screen: "login-failed",
        variants: Object.values(loginErrors).map((error) => ({
            label: error.title,
            screen: error.id,
            params: {
                login_error: error.code,
                dashboard_preview: "1",
                login_flow: "account",
            },
        })),
    },
    {
        id: "enter-connected",
        title: "Account wallet",
        owner: "Pollinations",
        screen: "dash-wallet",
        variants: [
            { label: "Paid available" },
            { label: "Quest only", params: { sim_paid: "0" } },
            { label: "Empty", params: { sim_paid: "0", sim_quest: "0" } },
            { label: "Loading", params: { account_case: "loading" } },
            { label: "Load failed", params: { account_case: "load-error" } },
            {
                label: "Checkout canceled",
                params: { account_case: "canceled" },
            },
            { label: "Payment pending", params: { account_case: "pending" } },
            {
                label: "Payment check failed",
                params: { account_case: "payment-error" },
            },
            { label: "Payment credited", params: { account_case: "credited" } },
            ...walletBillingVariants,
        ],
    },
    {
        id: "account-checkout",
        title: "Checkout",
        owner: "Stripe",
        screen: "dash-checkout",
    },
    {
        id: "account-billing",
        title: "Manage billing",
        owner: "Stripe",
        screen: "dash-billing",
    },
    {
        id: "news",
        title: "News & FAQ",
        owner: "Pollinations",
        screen: "dash-news",
        variants: [
            { label: "Signed in" },
            { label: "Signed out", screen: "dash-news-signed-out" },
        ],
    },
    {
        id: "catalog",
        title: "Models",
        owner: "Pollinations",
        screen: "dash-catalog",
        variants: [
            { label: "Models available" },
            { label: "Loading", params: { model_catalog: "loading" } },
            { label: "Load failed", params: { model_catalog: "error" } },
        ],
    },
    {
        id: "activity",
        title: "Activity",
        owner: "Pollinations",
        screen: "dash-activity",
        variants: [
            { label: "Activity available" },
            { label: "No activity", params: { collection_case: "empty" } },
            { label: "Loading", params: { collection_case: "loading" } },
            { label: "Load failed", params: { collection_case: "error" } },
        ],
    },
    {
        id: "quests",
        title: "Quests",
        owner: "Pollinations",
        screen: "dash-quests",
        variants: [
            { label: "Quests available" },
            {
                label: "No earned rewards",
                params: { collection_case: "empty" },
            },
            { label: "Loading", params: { collection_case: "loading" } },
            { label: "Load failed", params: { collection_case: "error" } },
            { label: "Checking quests", params: { quest_check: "waiting" } },
            { label: "Check unavailable", params: { quest_check: "error" } },
            {
                label: "Claiming",
                params: { action: "claim", result: "waiting" },
            },
            {
                label: "Claim failed",
                params: { action: "claim", result: "error" },
            },
            {
                label: "Reward claimed",
                params: { action: "claim", result: "success" },
            },
        ],
    },
    ...resourceScreens("keys", "key", "API keys", "API key"),
    ...resourceScreens("apps", "app", "Apps", "app"),
    ...resourceScreens("models", "model", "Your models", "model"),
    ...resourceScreens("agents", "agent", "Your agents", "agent"),
    {
        id: "account",
        title: "Account settings",
        owner: "Pollinations",
        screen: "dash-account",
        variants: [
            { label: "Account settings" },
            {
                label: "Loading connections",
                params: { settings_case: "loading" },
            },
            {
                label: "Connections unavailable",
                params: { settings_case: "error" },
            },
            {
                label: "Discord connected",
                params: { settings_case: "discord-connected" },
            },
            {
                label: "Discord identity unavailable",
                params: { settings_case: "discord-error" },
            },
            {
                label: "Connecting Discord",
                params: { action: "link-discord", result: "waiting" },
            },
            {
                label: "Discord connection failed",
                params: { action: "link-discord", result: "error" },
            },
            {
                label: "Disconnecting Discord",
                params: {
                    settings_case: "discord-connected",
                    action: "unlink-discord",
                    result: "waiting",
                },
            },
            {
                label: "Discord disconnect failed",
                params: {
                    settings_case: "discord-connected",
                    action: "unlink-discord",
                    result: "error",
                },
            },
            {
                label: "App connected",
                params: { settings_case: "apps-connected" },
            },
            {
                label: "Connecting app",
                params: { action: "link-integration", result: "waiting" },
            },
            {
                label: "App connection failed",
                params: { action: "link-integration", result: "error" },
            },
            {
                label: "Disconnecting app",
                params: { action: "unlink-integration", result: "waiting" },
            },
            {
                label: "App disconnect failed",
                params: { action: "unlink-integration", result: "error" },
            },
        ],
    },
    {
        id: "account-delete",
        title: "Delete account",
        owner: "Pollinations",
        screen: "dash-account-delete",
        variants: [
            { label: "Confirmation required" },
            { label: "Acknowledged", params: { action: "confirm-account" } },
            {
                label: "Deleting",
                params: { action: "delete-account", result: "waiting" },
            },
            {
                label: "Deletion failed",
                params: { action: "delete-account", result: "error" },
            },
        ],
    },
];

export type DashboardSection =
    | "main"
    | "topup"
    | "keys"
    | "apps"
    | "models"
    | "agents"
    | "news"
    | "catalog"
    | "activity"
    | "quests"
    | "account";
export const dashboardSections: { id: DashboardSection; label: string }[] = [
    { id: "main", label: "Login" },
    { id: "news", label: "News & FAQ" },
    { id: "catalog", label: "Models" },
    { id: "models", label: "My Models" },
    { id: "keys", label: "Keys" },
    { id: "apps", label: "Apps" },
    { id: "agents", label: "Agents" },
    { id: "topup", label: "Top up" },
    { id: "activity", label: "Activity" },
    { id: "quests", label: "Quests" },
    { id: "account", label: "Account" },
];
const pages = {
    news: "/news",
    catalog: "/models",
    activity: "/activity",
    quests: "/quests",
    account: "/account",
} as const;
const collections = {
    keys: { prefix: "key", path: "/keys" },
    apps: { prefix: "app", path: "/apps" },
    models: { prefix: "model", path: "/my-models" },
    agents: { prefix: "agent", path: "/agents" },
} as const;

dashboardScreens.sort(
    (a, b) =>
        dashboardSections.findIndex(
            (section) => section.id === dashboardSectionForScreen(a.id),
        ) -
        dashboardSections.findIndex(
            (section) => section.id === dashboardSectionForScreen(b.id),
        ),
);

function requestStates(
    screen: string,
    action: string,
    pending: string,
): NonNullable<CanvasScreen["variants"]> {
    return [
        { label: "Ready" },
        { label: pending, params: { action, result: "waiting" } },
        { label: "Failed", params: { action, result: "error" } },
    ].map((v) => ({ ...v, screen }));
}
function resourceScreens(
    section: string,
    prefix: string,
    title: string,
    singular: string,
): CanvasScreen[] {
    const deployment = section === "models" || section === "agents";
    const list: CanvasScreen = {
        id: section,
        title,
        owner: "Pollinations",
        screen: `dash-${section}`,
        variants: [
            { label: "Populated" },
            { label: "Empty", params: { collection_case: "empty" } },
            ...(deployment
                ? [
                      {
                          label: "Loading",
                          params: { collection_case: "loading" },
                      },
                      {
                          label: "Load failed",
                          params: { collection_case: "error" },
                      },
                      {
                          label: "Public publishing",
                          params: { publisher: "1" },
                      },
                      { label: "Hidden", params: { hidden: "1" } },
                  ]
                : []),
        ],
    };
    return [
        list,
        {
            id: `${prefix}-create`,
            title: `Add ${singular}`,
            owner: "Pollinations",
            screen: `dash-${section}-create`,
            variants: [
                ...requestStates(
                    `dash-${section}-create`,
                    "create",
                    "Submitting",
                ),
                ...(!deployment
                    ? [
                          {
                              label: "Created · copy key",
                              params: { action: "create", result: "success" },
                          },
                      ]
                    : []),
                ...(deployment
                    ? [
                          {
                              label: "Public publishing",
                              params: { publisher: "1" },
                          },
                      ]
                    : []),
            ],
        },
        {
            id: `${prefix}-edit`,
            title: `Edit ${singular}`,
            owner: "Pollinations",
            screen: `dash-${section}-edit`,
            variants: [
                ...requestStates(`dash-${section}-edit`, "save", "Saving"),
                ...(deployment
                    ? [
                          {
                              label: "Public publishing",
                              params: { publisher: "1" },
                          },
                      ]
                    : []),
                ...(section === "agents"
                    ? [
                          {
                              label: "Endpoint agent",
                              params: { agent_kind: "endpoint" },
                          },
                      ]
                    : []),
                ...(section === "models"
                    ? [
                          {
                              label: "Changes queued",
                              params: { publisher: "1", queued: "1" },
                          },
                          {
                              label: "Testing endpoint",
                              params: {
                                  publisher: "1",
                                  action: "test",
                                  result: "waiting",
                              },
                          },
                          {
                              label: "Test failed",
                              params: {
                                  publisher: "1",
                                  action: "test",
                                  result: "error",
                              },
                          },
                          {
                              label: "Test succeeded",
                              params: {
                                  publisher: "1",
                                  action: "test",
                                  result: "success",
                              },
                          },
                      ]
                    : []),
            ],
        },
        {
            id: `${prefix}-delete`,
            title: `Delete ${singular}`,
            owner: "Pollinations",
            screen: `dash-${section}-delete`,
            variants: requestStates(
                `dash-${section}-delete`,
                "delete",
                "Deleting",
            ),
        },
        ...(deployment
            ? [
                  {
                      id: `${prefix}-visibility`,
                      title: `${singular === "agent" ? "Agent" : "Model"} visibility`,
                      owner: "Pollinations" as const,
                      screen: `dash-${section}-visibility`,
                      variants: [
                          { label: "Hide" },
                          { label: "Relist", params: { hidden: "1" } },
                          {
                              label: "Updating visibility",
                              params: {
                                  action: "visibility",
                                  result: "waiting",
                              },
                          },
                          {
                              label: "Visibility update failed",
                              params: { action: "visibility", result: "error" },
                          },
                      ],
                  },
              ]
            : []),
    ];
}
export function dashboardSectionForScreen(id: string): DashboardSection {
    if (id === "account-delete") return "account";
    if (id in pages) return id as DashboardSection;
    for (const [section, { prefix }] of Object.entries(collections))
        if (id === section || id.startsWith(`${prefix}-`))
            return section as DashboardSection;
    if (["enter-connected", "account-checkout", "account-billing"].includes(id))
        return "topup";
    return "main";
}
export function dashboardRouteForPreview(screen: string): string | undefined {
    if (screen === "dash-account-delete") return "/account";
    if (screen === "dash-news-signed-out") return "/news";
    for (const [id, path] of Object.entries(pages))
        if (screen === `dash-${id}`) return path;
    for (const [section, { path }] of Object.entries(collections))
        if (
            screen === `dash-${section}` ||
            screen.startsWith(`dash-${section}-`)
        )
            return path;
    return undefined;
}
export function dashboardScreenForLocation(path: string, dialogTitle = "") {
    if (path === "/account" && /^Delete/.test(dialogTitle))
        return "account-delete";
    for (const [id, route] of Object.entries(pages))
        if (path === route) return id;
    for (const [section, { prefix, path: route }] of Object.entries(
        collections,
    )) {
        if (path !== route) continue;
        const action = /^(Create|Add|Register)/.test(dialogTitle)
            ? "create"
            : /^Edit/.test(dialogTitle)
              ? "edit"
              : /^Delete/.test(dialogTitle)
                ? "delete"
                : /^(Hide|Relist)/.test(dialogTitle)
                  ? "visibility"
                  : null;
        return action ? `${prefix}-${action}` : section;
    }
    return path === "/error"
        ? "dashboard-auth-error"
        : path === "/sign-in"
          ? "enter-signed-out"
          : "enter-connected";
}

export function dashboardSignInResume(callbackURL: unknown) {
    if (typeof callbackURL !== "string") return undefined;
    const callback = new URL(callbackURL, "https://preview.invalid");
    // Real routes use memory history here, so window.location still names the preview document.
    const path =
        callback.pathname === "/pollen-connect-screen.html"
            ? dashboardRouteForPreview(
                  callback.searchParams.get("screen") ?? "",
              )
            : callback.pathname;
    if (!path || path === "/sign-in") return undefined;
    const id = dashboardScreenForLocation(path);
    return dashboardScreens.find((entry) => entry.id === id)?.screen;
}

export function getDashboardFlow(section?: string) {
    const screens = dashboardScreens.filter(
        (entry) => !section || dashboardSectionForScreen(entry.id) === section,
    );
    const ids = new Set(screens.map((e) => e.id));
    const nodes: FlowNode[] = screens.map((e, i) => ({
        id: e.id,
        screen: e.id,
        x: 180 + (i % 3) * 620,
        y: 150 + Math.floor(i / 3) * 850,
    }));
    if (!section || section === "main") {
        nodes.push(
            {
                id: "dashboard-billing",
                kind: "outcome",
                label: "Contact billing",
                note: "Account suspended · email billing@pollinations.ai",
                x: 2040,
                y: 250,
            },
            {
                id: "dashboard-production",
                kind: "outcome",
                label: "Visit pollinations.ai",
                note: "Staging is invite-only · continue on the public site",
                x: 2040,
                y: 560,
            },
        );
        ids.add("dashboard-billing");
        ids.add("dashboard-production");
    }
    if (section === "main") {
        nodes.push({
            id: "dashboard-ready",
            kind: "outcome",
            label: "Dashboard",
            note: "Continue to any dashboard page",
            x: 800,
            y: 1010,
        });
        ids.add("dashboard-ready");
    }
    const collectionEdges: FlowEdge[] = Object.entries(collections).flatMap(
        ([id, { prefix }]) =>
            ["create", "edit", "delete", "visibility"].flatMap((action) => [
                {
                    from: id,
                    to: `${prefix}-${action}`,
                    label:
                        action === "create"
                            ? "Add"
                            : action === "visibility"
                              ? "Hide / Relist"
                              : action === "edit"
                                ? "Edit"
                                : "Delete",
                },
                {
                    from: `${prefix}-${action}`,
                    to: id,
                    label:
                        action === "create" && ["keys", "apps"].includes(id)
                            ? "Copy and close / Cancel"
                            : "Complete / Cancel",
                },
            ]),
    );
    const edges: FlowEdge[] = [
        ...collectionEdges,
        { from: "account", to: "account-delete", label: "Delete account" },
        { from: "account-delete", to: "account", label: "Cancel" },
        { from: "account-delete", to: "news", label: "Deleted · signed out" },
        {
            from: "enter-signed-out",
            to: "dashboard-github",
            label: "Sign in with GitHub",
        },
        {
            from: "dashboard-github",
            to: section === "main" ? "dashboard-ready" : "enter-connected",
            label: "Return to requested page",
        },
        {
            from: "dashboard-github",
            to: "dashboard-auth-error",
            label: "Sign-in failed or restricted",
        },
        {
            from: "dashboard-auth-error",
            to: "enter-signed-out",
            label: "Generic failure · retry sign-in",
        },
        {
            from: "dashboard-auth-error",
            to: "dashboard-billing",
            label: "Account suspended",
        },
        {
            from: "dashboard-auth-error",
            to: "dashboard-production",
            label: "Staging restricted",
        },
        { from: "enter-connected", to: "account-checkout", label: "Buy" },
        {
            from: "enter-connected",
            to: "account-billing",
            label: "Manage billing",
        },
        {
            from: "account-billing",
            to: "enter-connected",
            label: "Return to wallet",
        },
        {
            from: "account-checkout",
            to: "enter-connected",
            label: "Cancel or check server credit",
        },
        { from: "enter-connected", to: "keys", label: "API keys" },
        { from: "keys", to: "enter-connected", label: "Pollen" },
        { from: "enter-connected", to: "enter-signed-out", label: "Sign out" },
        { from: "keys", to: "enter-signed-out", label: "Sign out" },
    ].filter((e) => ids.has(e.from) && ids.has(e.to));
    return { screens, nodes, edges };
}

export type DashboardPreviewSelection = {
    screen: string;
    variant: number;
    revision: number;
};
