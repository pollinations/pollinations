import { HIGHLIGHTS_RAW_URL } from "@frontend/components/news-faq/highlights";
import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { getDefaultErrorMessage } from "../../../shared/error";
import type { PreviewResult } from "../capture-types";
import { captureIdentity, createCaptureService } from "../captures";
import type { ReviewCase } from "../review-cases";
import { reviewCasesForFlow, reviewFlows } from "../review-inventory";
import { readSourceInfo } from "../source-info";

const source = await readSourceInfo();

async function capture(
    service: ReturnType<typeof createCaptureService>,
    flow: string,
    section: string,
    id: string,
    presentation = { theme: "dark", size: "mobile" },
) {
    const request = new Request(
        `http://localhost:4180/__flow/previews?${new URLSearchParams({
            flow,
            section,
            cases: id,
            ...presentation,
        })}`,
    );
    for (;;) {
        const response = await service.fetch(request);
        expect(response?.ok).toBe(true);
        const result = (await response?.json()) as PreviewResult;
        if (result.status !== "loading") return result.cases[id];
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

it
    .runIf(process.env.FLOW_CAPTURE_TEST === "1")
    .each(["main", "news", "catalog", "activity"])(
    "captures current main dashboard remainder: %s",
    async (section) => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow("account", section)) {
                const result = await capture(
                    service,
                    "account",
                    section,
                    recipe.id,
                    section === "main" || section === "catalog"
                        ? { theme: "dark", size: "mobile" }
                        : { theme: "light", size: "desktop" },
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe(recipe.provider ? "reference" : "ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    240_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1").each(["main", "link"])(
    "captures Device funding without approval: %s",
    async (section) => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow("device", section).filter(
                (item) =>
                    ["consent-no-pollen", "consent-paid-required"].includes(
                        item.id,
                    ),
            )) {
                const result = await capture(
                    service,
                    "device",
                    section,
                    recipe.id,
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified device/${section}/${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    120_000,
);

it.runIf(process.env.FLOW_CREDENTIAL_TEST === "1").each([
    ["app", "main"],
    ["app", "topup"],
    ["account", "keys"],
    ["account", "apps"],
])(
    "captures final SDK and key editor batch: %s/%s",
    async (flow, section) => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            const cases = reviewCasesForFlow(flow, section).filter((recipe) =>
                flow === "account"
                    ? recipe.variant === "Created · copy key"
                    : section === "topup"
                      ? [
                            "account-app",
                            "account-key",
                            "account-auth-error",
                        ].includes(recipe.pageId)
                      : [
                            "app-connected",
                            "app-checking-connection",
                            "app-connection-error",
                            "app-loading-account",
                            "app-account-error",
                            "app-limit-reached",
                            "consent-no-pollen",
                            "consent-paid-required",
                            "consent-failed-code",
                        ].includes(recipe.id),
            );
            expect(cases.length).toBeGreaterThan(0);
            for (const recipe of cases) {
                const result = await capture(service, flow, section, recipe.id);
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures current main Admin without issuing credentials",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow("admin", "main").filter(
                (item) => item.pageId !== "dashboard-connected",
            )) {
                const result = await capture(
                    service,
                    "admin",
                    "main",
                    recipe.id,
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_ADMIN_OAUTH_TEST === "1")(
    "captures Admin with authorized disposable OAuth sessions",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow("admin", "main").filter(
                (item) => item.pageId === "dashboard-connected",
            )) {
                const result = await capture(
                    service,
                    "admin",
                    "main",
                    recipe.id,
                    { theme: "light", size: "desktop" },
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    180_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1").each(["account", "quests"])(
    "captures current main settings and quests: %s",
    async (section) => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow("account", section)) {
                // No successful external connection, sign-out or deletion.
                for (const rule of recipe.requests ?? [])
                    if (rule.method === "POST" || rule.method === "DELETE")
                        expect(["pending", "server-error"]).toContain(
                            rule.outcome,
                        );
                const result = await capture(
                    service,
                    "account",
                    section,
                    recipe.id,
                    section === "account"
                        ? { theme: "dark", size: "mobile" }
                        : { theme: "light", size: "desktop" },
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1").each(["account", "app"])(
    "captures current main %s wallet and billing",
    async (flow) => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of reviewCasesForFlow(flow, "topup").filter(
                (item) =>
                    ["enter-connected", "account-wallet"].includes(item.pageId),
            )) {
                const result = await capture(
                    service,
                    flow,
                    "topup",
                    recipe.id,
                    flow === "account"
                        ? { theme: "light", size: "desktop" }
                        : { theme: "dark", size: "mobile" },
                );
                expect(
                    result.status,
                    `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
                console.log(`Verified ${recipe.id}`);
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures current main Models and Agents",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const section of ["models", "agents"]) {
                for (const recipe of reviewCasesForFlow("account", section)) {
                    // Form writes are held or failed before Enter handles them.
                    // Public selection is read-only; endpoint probes use the
                    // declared external fixture and an invalid bearer token.
                    if (recipe.steps?.some((step) => step.action === "click"))
                        expect(
                            recipe.requests?.length ||
                                recipe.prepare?.endpoint === "success" ||
                                recipe.variant === "Public publishing" ||
                                recipe.variant === "Code agent",
                            recipe.id,
                        ).toBeTruthy();
                    const result = await capture(
                        service,
                        "account",
                        section,
                        recipe.id,
                        section === "models"
                            ? { theme: "dark", size: "mobile" }
                            : { theme: "light", size: "desktop" },
                    );
                    expect(
                        result.status,
                        `${recipe.id}: ${result.status === "error" ? result.error : ""}`,
                    ).toBe("ready");
                    console.log(`Verified ${recipe.id}`);
                }
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "capture smoke covers every section in mobile dark and desktop light",
    async () => {
        const cases = [
            ["app", "main", "consent"],
            ["app", "topup", "topup-account-wallet"],
            ["device", "main", "consent"],
            ["device", "link", "sign-in"],
            ["account", "main", "dashboard-enter-signed-out"],
            ["account", "news", "dashboard-news"],
            ["account", "catalog", "dashboard-catalog"],
            ["account", "models", "dashboard-models"],
            ["account", "keys", "dashboard-keys"],
            ["account", "apps", "dashboard-apps"],
            ["account", "agents", "dashboard-agents"],
            ["account", "topup", "dashboard-enter-connected"],
            ["account", "activity", "dashboard-activity"],
            ["account", "quests", "dashboard-quests"],
            ["account", "account", "dashboard-account"],
            ["admin", "main", "dashboard-sign-in"],
        ];
        expect(
            cases.map(([flow, section]) => `${flow}/${section}`).sort(),
        ).toEqual(
            reviewFlows.map(({ flow, section }) => `${flow}/${section}`).sort(),
        );
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const [flow, section, id] of cases) {
                const recipe = reviewCasesForFlow(flow, section).find(
                    (item) => item.id === id,
                );
                expect(recipe, `${flow}/${section}/${id}`).toBeDefined();
                // CI inspects prepared pages; it never approves consent or
                // submits controls that create reusable credentials.
                expect(recipe?.steps ?? []).toEqual([]);
                expect(recipe?.action).toBeUndefined();
                expect(recipe?.provider).toBeUndefined();
                for (const presentation of [
                    { theme: "dark", size: "mobile" },
                    { theme: "light", size: "desktop" },
                ]) {
                    const result = await capture(
                        service,
                        flow,
                        section,
                        id,
                        presentation,
                    );
                    expect(
                        result.status,
                        `${flow}/${section}/${id} (${presentation.size} ${presentation.theme}): ${result.status === "error" ? result.error : ""}`,
                    ).toBe("ready");
                }
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures App access declined through the real cancellation controls",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            const result = await capture(
                service,
                "app",
                "main",
                "app-access-declined",
            );
            expect(
                result.status,
                result.status === "error" ? result.error : "",
            ).toBe("ready");
        } finally {
            await service.close();
        }
    },
    60_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures App pending and error situations without issuing keys",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const id of [
                "app-checking",
                "loading",
                "consent-checking",
                "consent-models-loading",
                "consent-models-error",
                "app-signing-in",
                "error",
                "login-failed",
                "account-deactivated",
                "staging-invite-only",
                "blocked-lookup",
                "blocked-invalid-challenge",
                "blocked-missing-redirect",
                "blocked-invalid-redirect",
                "blocked-redirect-scheme",
                "blocked-response-type",
                "blocked-missing-client",
                "blocked-missing-challenge",
                "blocked-challenge-method",
                "blocked-app",
                "blocked-redirect",
                "consent-connecting",
                "consent-failed-key",
                "consent-session-expired",
            ]) {
                const recipe = reviewCasesForFlow("app", "main").find(
                    (item) => item.id === id,
                );
                if (!recipe) throw new Error(`Missing ${id}`);
                // Every consent submission here is intercepted before Enter
                // can issue a key. No code-exchange or connected-app recipes.
                if (recipe.steps?.some((step) => step.text === "Allow access"))
                    expect(recipe.requests).toContainEqual(
                        expect.objectContaining({
                            path: "/api/api-keys",
                            method: "POST",
                        }),
                    );
                const result = await capture(service, "app", "main", id);
                expect(
                    result.status,
                    result.status === "error" ? `${id}: ${result.error}` : id,
                ).toBe("ready");
            }
        } finally {
            await service.close();
        }
    },
    240_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures dashboard keys and apps without issuing credentials",
    async () => {
        const { startRuntime } = await import("../runtime");
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const section of ["keys", "apps"]) {
                for (const recipe of reviewCasesForFlow("account", section)) {
                    // Revealing a newly issued key requires scoped approval.
                    if (recipe.variant === "Created · copy key") continue;
                    if (recipe.steps?.some((step) => step.action === "click"))
                        expect(recipe.requests).toContainEqual(
                            expect.objectContaining({ method: "POST" }),
                        );
                    const result = await capture(
                        service,
                        "account",
                        section,
                        recipe.id,
                        section === "keys"
                            ? { theme: "dark", size: "mobile" }
                            : { theme: "light", size: "desktop" },
                    );
                    expect(
                        result.status,
                        result.status === "error"
                            ? `${recipe.id}: ${result.error}`
                            : recipe.id,
                    ).toBe("ready");
                }
            }
        } finally {
            await service.close();
        }
    },
    240_000,
);

for (const requiresKey of [false, true]) {
    it.runIf(
        process.env.FLOW_CAPTURE_TEST === "1" &&
            (!requiresKey ||
                process.env.FLOW_DEVICE_APPROVAL_ERROR_TEST === "1"),
    )(
        `captures Device recovery ${requiresKey ? "after key creation" : "without key creation"}`,
        async () => {
            const { startRuntime } = await import("../runtime");
            const service = createCaptureService({
                source: () => source,
                loadCases: async () => ({ reviewCasesForFlow }),
                loadRuntime: async () => startRuntime,
            });
            try {
                for (const section of ["main", "link"] as const) {
                    for (const id of requiresKey
                        ? ["device-result", "device-submit-approve"]
                        : [
                              "sign-in",
                              "device-signing-in",
                              "error",
                              "login-failed",
                              "account-deactivated",
                              "staging-invite-only",
                              "device-code",
                              "device-code-invalid",
                              "device-code-expired",
                              "device-code-used",
                              "device-code-unavailable",
                              "consent",
                              "device-request-invalid",
                              "device-request-expired",
                              "device-request-used",
                              "device-request-unavailable",
                              "device-request-app",
                              "device-request-lookup",
                              "device-session",
                              "device-verifying",
                              "device-checking",
                              "device-approving",
                              "device-denying",
                              "device-submit-key",
                              "device-submit-session",
                              "device-submit-deny",
                              "device-declined",
                          ]) {
                        const recipe = reviewCasesForFlow(
                            "device",
                            section,
                        ).find((item) => item.id === id);
                        if (!recipe) throw new Error(`Missing ${id}`);
                        if (
                            !requiresKey &&
                            recipe.steps?.some(
                                (step) => step.text === "Allow access",
                            )
                        )
                            expect(recipe.requests).toContainEqual(
                                expect.objectContaining({
                                    path: "/api/api-keys",
                                    method: "POST",
                                }),
                            );
                        const result = await capture(
                            service,
                            "device",
                            section,
                            id,
                            section === "main"
                                ? { theme: "dark", size: "mobile" }
                                : { theme: "light", size: "desktop" },
                        );
                        expect(
                            result.status,
                            result.status === "error" ? result.error : id,
                        ).toBe("ready");
                    }
                }
            } finally {
                await service.close();
            }
        },
        300_000,
    );
}

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "verifies Account settings controls and rejects mismatched connection states",
    async () => {
        const { startRuntime } = await import("../runtime");
        const recipes = reviewCasesForFlow("account", "account").filter(
            ({ pageId }) => pageId === "account",
        );
        let probe: ReviewCase | undefined;
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({
                reviewCasesForFlow: (flow, section) =>
                    reviewCasesForFlow(flow, section).map((item) =>
                        probe?.id === item.id ? probe : item,
                    ),
            }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const recipe of recipes) {
                // Every connect/disconnect request is held or fails before the
                // provider. These checks do not create or revoke credentials.
                for (const rule of recipe.requests ?? [])
                    if (rule.method && rule.method !== "GET")
                        expect(["pending", "server-error"]).toContain(
                            rule.outcome,
                        );
                const result = await capture(
                    service,
                    "account",
                    "account",
                    recipe.id,
                );
                expect(
                    result.status,
                    result.status === "error"
                        ? `${recipe.variant}: ${result.error}`
                        : recipe.id,
                ).toBe("ready");
            }
            const recipe = (variant: string) => {
                const result = recipes.find((item) => item.variant === variant);
                if (!result)
                    throw new Error(
                        `Missing Account settings situation: ${variant}`,
                    );
                return result;
            };
            const ready = recipe("Account settings");
            for (const mismatch of [
                ...[
                    "/api/account/integrations",
                    "/api/account/integrations/toolkits",
                ].map((path) => ({
                    ...ready,
                    requests: [{ path, outcome: "unavailable" as const }],
                })),
                { ...ready, prepare: { connections: "connected" as const } },
                { ...recipe("App connected"), prepare: {} },
                {
                    ...recipe("Discord connected"),
                    prepare: { discord: "unavailable" as const },
                },
                {
                    ...recipe("App catalog unavailable"),
                    requests: [
                        {
                            path: "/api/account/integrations",
                            outcome: "unavailable" as const,
                        },
                        {
                            path: "/api/account/integrations/toolkits",
                            outcome: "unavailable" as const,
                        },
                    ],
                },
                {
                    ...recipe("Connecting app"),
                    requests: [
                        {
                            path: "/api/account/integrations",
                            method: "POST",
                            outcome: "server-error" as const,
                        },
                    ],
                },
            ]) {
                probe = mismatch;
                service.invalidate();
                expect(
                    await capture(service, "account", "account", probe.id),
                ).toMatchObject({
                    status: "error",
                    error: expect.stringContaining("checking "),
                });
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures real News content and rejects missing or failed feeds",
    async () => {
        const { startRuntime } = await import("../runtime");
        let fault: "blocked" | "empty" | "http-error" | undefined;
        let feedBody = "";
        // Exercise the real page with transport failures, without adding fault
        // hooks to Enter or creating replacement News markup in Flow.
        const launch = chromium.launch.bind(chromium);
        const launchSpy = vi
            .spyOn(chromium, "launch")
            .mockImplementation(async (options) => {
                const browser = await launch(options);
                const newContext = browser.newContext.bind(browser);
                vi.spyOn(browser, "newContext").mockImplementation(
                    async (options) => {
                        const context = await newContext(options);
                        const newPage = context.newPage.bind(context);
                        vi.spyOn(context, "newPage").mockImplementation(
                            async () => {
                                const page = await newPage();
                                page.on("response", async (response) => {
                                    if (
                                        !fault &&
                                        response.url() === HIGHLIGHTS_RAW_URL &&
                                        response.ok()
                                    )
                                        feedBody = await response.text();
                                });
                                if (fault)
                                    await page.route(
                                        HIGHLIGHTS_RAW_URL,
                                        (route) =>
                                            fault === "blocked"
                                                ? route.abort("blockedbyclient")
                                                : route.fulfill({
                                                      status:
                                                          fault === "http-error"
                                                              ? 503
                                                              : 200,
                                                      contentType: "text/plain",
                                                      headers: {
                                                          "access-control-allow-origin":
                                                              "*",
                                                      },
                                                      body:
                                                          fault === "http-error"
                                                              ? feedBody
                                                              : "",
                                                  }),
                                    );
                                return page;
                            },
                        );
                        return context;
                    },
                );
                return browser;
            });
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => startRuntime,
        });
        try {
            for (const section of ["news", "main"]) {
                const cases = reviewCasesForFlow("account", section).filter(
                    ({ pageId }) =>
                        ["news", "enter-signed-out"].includes(pageId),
                );
                for (const recipe of cases) {
                    const result = await capture(
                        service,
                        "account",
                        section,
                        recipe.id,
                    );
                    expect(
                        result.status,
                        result.status === "error" ? result.error : recipe.id,
                    ).toBe("ready");
                    const path = section === "news" ? "/news" : "/sign-in";
                    expect(result).toMatchObject({
                        entryRoute: path,
                        finalRoute: path,
                    });
                }
            }
            expect(feedBody).not.toBe("");
            for (const failure of ["blocked", "empty", "http-error"] as const) {
                fault = failure;
                service.invalidate();
                // In each failure the product still renders Announcements. A
                // passing page-heading assertion must not hide the missing feed.
                const result = await capture(
                    service,
                    "account",
                    "news",
                    "dashboard-news",
                );
                expect(result).toMatchObject({
                    status: "error",
                    error: expect.stringContaining(
                        "checking News highlights from the real feed",
                    ),
                });
            }
        } finally {
            await service.close();
            launchSpy.mockRestore();
        }
    },
    240_000,
);

it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "verifies consent identity, grants and fields through the real App and Device pages",
    async () => {
        const { startRuntime } = await import("../runtime");
        let probe: ReviewCase | undefined;
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({
                reviewCasesForFlow: (flow, section) =>
                    reviewCasesForFlow(flow, section).map((item) =>
                        probe?.id === item.id ? probe : item,
                    ),
            }),
            loadRuntime: async () => startRuntime,
        });
        try {
            // Busy approval requests are held before key creation. No successful
            // approval or reusable credential is needed to review the form.
            for (const [flow, ids] of [
                [
                    "app",
                    [
                        "consent",
                        "consent-no-pollen",
                        "consent-paid-required",
                        "consent-checking",
                        "consent-models-loading",
                        "consent-models-error",
                        "consent-connecting",
                    ],
                ],
                [
                    "device",
                    [
                        "consent",
                        "consent-no-pollen",
                        "consent-paid-required",
                        "device-checking",
                        "device-approving",
                        "device-denying",
                    ],
                ],
            ] as const) {
                for (const id of ids) {
                    const result = await capture(service, flow, "main", id);
                    expect(
                        result.status,
                        result.status === "error" ? result.error : id,
                    ).toBe("ready");
                }
            }
            const consent = reviewCasesForFlow("app", "main").find(
                ({ id }) => id === "consent",
            );
            if (!consent) throw new Error("Missing consent recipe");
            // The same real page must fail when the recipe expects a different
            // app, grant or limit. This exercises the capture verifier itself.
            for (const mismatch of [
                {
                    selector: "#authorize-dialog-title",
                    text: "Another app",
                },
                {
                    selector:
                        'label:has(input[aria-label="Share display name and email"]:not(:checked))',
                },
                {
                    selector: 'input[name="pollen-budget"][value="3"]',
                },
                {
                    selector: 'input[name="expiry-days"][value="14"]',
                },
            ]) {
                probe = {
                    ...consent,
                    expected: [...consent.expected, mismatch],
                };
                service.invalidate();
                expect(
                    await capture(service, "app", "main", consent.id),
                ).toMatchObject({
                    status: "error",
                    error: expect.stringContaining(
                        `checking ${mismatch.text ?? mismatch.selector}`,
                    ),
                });
            }
        } finally {
            await service.close();
        }
    },
    300_000,
);

const selection = {
    flow: "app",
    section: "main",
    theme: "dark" as const,
    size: "mobile" as const,
};
const recipe: ReviewCase = {
    id: "sign-in",
    pageId: "sign-in",
    family: "sign-in",
    title: "Sign in",
    query: { screen: "oauth" },
    conditions: { account: "signed-out" },
    expected: [{ selector: "#sign-in-title" }],
};

// Requires Flow's local dev server for the source UI. API traffic and data
// stay in a disposable runtime; these cases never issue reusable credentials.
it.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "captures real funding, quest and model situations and rejects mismatched pages or states",
    async () => {
        const { startRuntime } = await import("../runtime");
        let wrongRoute = false;
        let wrongError = false;
        let wrongSituation: string | undefined;
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({
                reviewCasesForFlow: (flow, section) =>
                    reviewCasesForFlow(flow, section).map((item) => {
                        if (wrongError && item.id === "consent-failed-key")
                            return {
                                ...item,
                                requests: item.requests?.map((rule) => ({
                                    ...rule,
                                    outcome: "unavailable" as const,
                                })),
                            };
                        if (wrongRoute && item.id === "consent-session-expired")
                            return {
                                ...item,
                                finalRoute: "/wrong-review-route",
                            };
                        if (item.id === wrongSituation)
                            return {
                                ...item,
                                steps: [
                                    {
                                        selector:
                                            item.family === "catalog"
                                                ? '[role="alert"]'
                                                : ".text-intent-danger-text",
                                        action: "wait" as const,
                                    },
                                ],
                                requests: [
                                    {
                                        path:
                                            item.family === "catalog"
                                                ? "/gen/models"
                                                : "/api/quests/catalog",
                                        outcome: "unavailable" as const,
                                    },
                                ],
                            };
                        return item;
                    }),
            }),
            loadRuntime: async () => startRuntime,
        });
        const captureCase = (flow: string, section: string, id: string) =>
            capture(service, flow, section, id);
        try {
            for (const id of ["consent-no-pollen", "consent-paid-required"]) {
                // These assertions run against Enter's actual badge and model
                // selection, not a Flow-built representation of the state.
                const funding = await captureCase("app", "main", id);
                expect(funding, id).toMatchObject({
                    status: "ready",
                    entryRoute: "/authorize",
                    finalRoute: "/authorize",
                });
            }
            // Exercise the failure independently: the intercepted POST cannot
            // issue a key, and the real product renders its connection error.
            expect(
                await captureCase("app", "main", "consent-failed-key"),
            ).toMatchObject({
                status: "ready",
                entryRoute: "/authorize",
                finalRoute: "/authorize",
            });
            // These recipes block the failed write before it can issue a key,
            // create an external session, or mutate the reviewed resource.
            // Successful App callbacks, device approval and Admin sign-in are
            // deliberately excluded: they create reusable credentials first.
            for (const { flow, section, cases } of reviewFlows) {
                if (
                    flow === "admin" ||
                    (flow === "app" && section === "main") ||
                    (flow === "device" && section !== "main")
                )
                    continue;
                for (const item of cases.filter(
                    (item) =>
                        item.id !== "device-submit-approve" &&
                        item.requests?.some(
                            (rule) => rule.outcome === "server-error",
                        ),
                )) {
                    const result = await captureCase(flow, section, item.id);
                    expect(
                        result.status,
                        `${item.title}: ${result.status === "error" ? result.error : ""}`,
                    ).toBe("ready");
                }
            }
            wrongError = true;
            service.invalidate();
            expect(
                await captureCase("app", "main", "consent-failed-key"),
            ).toMatchObject({
                status: "error",
                error: expect.stringContaining(getDefaultErrorMessage(500)),
            });
            wrongError = false;
            service.invalidate();
            const consent = await captureCase(
                "app",
                "main",
                "consent-session-expired",
            );
            expect(consent).toMatchObject({
                status: "ready",
                entryRoute: "/authorize",
                finalRoute: "/authorize",
            });
            if (consent.status !== "ready")
                throw new Error("Consent capture failed");
            const image = await service.fetch(
                new Request(`http://localhost:4180${consent.image}`),
            );
            expect(image?.headers.get("content-type")).toBe("image/png");
            expect((await image?.arrayBuffer())?.byteLength).toBeGreaterThan(
                1000,
            );
            // Every quest state exercises the real catalog/check/claim flow.
            // Pending and failed claims intercept the POST before any write.
            for (const item of reviewCasesForFlow("account", "quests")) {
                const result = await captureCase("account", "quests", item.id);
                expect(
                    result.status,
                    `${item.title}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
            }
            const models = reviewCasesForFlow("account", "catalog");
            for (const item of models) {
                const result = await captureCase("account", "catalog", item.id);
                expect(
                    result.status,
                    `${item.title}: ${result.status === "error" ? result.error : ""}`,
                ).toBe("ready");
            }
            // The former loading check matched "All, 0 models" even after
            // loading failed. A ready quest heading also must not hide errors.
            const loadingModels = models.find(
                (item) => item.variant === "Loading",
            );
            const readyQuests = reviewCasesForFlow("account", "quests")[0];
            if (!loadingModels)
                throw new Error("Missing model loading situation");
            for (const [section, item] of [
                ["catalog", loadingModels],
                ["quests", readyQuests],
            ] as const) {
                wrongSituation = item.id;
                const result = await captureCase("account", section, item.id);
                expect(
                    result.status,
                    `${item.title} accepted the wrong state`,
                ).toBe("error");
            }
            wrongSituation = undefined;
            wrongRoute = true;
            service.invalidate();
            expect(
                await captureCase("app", "main", "consent-session-expired"),
            ).toMatchObject({
                status: "error",
                error: expect.stringContaining(
                    "verifying the requested routes",
                ),
            });
        } finally {
            await service.close();
        }
    },
    600_000,
);

describe("preview capture reuse", () => {
    it("shares identical behavior across display names and sections", () => {
        expect(
            captureIdentity(
                {
                    ...recipe,
                    id: "other",
                    pageId: "other",
                    family: "other",
                    title: "Other",
                },
                { ...selection, section: "topup" },
            ),
        ).toBe(captureIdentity(recipe, selection));
    });

    it("keeps account setup, request faults, actions, assertions and entry routes distinct", () => {
        const changes: Partial<ReviewCase>[] = [
            { conditions: { account: "banned" } },
            { prepare: { device: "pending" } },
            {
                requests: [
                    { path: "/api/auth/get-session", outcome: "pending" },
                ],
            },
            { action: { type: "sign-in", outcome: "error" } },
            { steps: [{ selector: "button", action: "click" }] },
            {
                expected: [
                    { selector: "#sign-in-title", text: "Account suspended" },
                ],
            },
            { query: { screen: "device-signed-out" } },
        ];
        for (const change of changes)
            expect(
                captureIdentity({ ...recipe, ...change }, selection),
            ).not.toBe(captureIdentity(recipe, selection));
    });

    it("separates viewport and color mode while ignoring object property order", () => {
        expect(
            captureIdentity(recipe, { ...selection, theme: "light" }),
        ).not.toBe(captureIdentity(recipe, selection));
        expect(
            captureIdentity(recipe, { ...selection, size: "desktop" }),
        ).not.toBe(captureIdentity(recipe, selection));
        expect(
            captureIdentity(
                { ...recipe, query: { screen: "oauth", budget: "5" } },
                selection,
            ),
        ).toBe(
            captureIdentity(
                { ...recipe, query: { budget: "5", screen: "oauth" } },
                selection,
            ),
        );
    });

    it("never skips device grant verification through a shared image", () => {
        expect(
            captureIdentity(
                { ...recipe, id: "device-result" },
                { ...selection, flow: "device" },
            ),
        ).not.toBe(
            captureIdentity(
                { ...recipe, id: "other" },
                { ...selection, flow: "device" },
            ),
        );
    });
});

describe("capture request selection", () => {
    it("returns external references without creating a runtime", async () => {
        let runtimeLoads = 0;
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => {
                runtimeLoads++;
                throw new Error("External references need no runtime");
            },
        });
        try {
            for (const { flow, section, cases } of reviewFlows) {
                for (const recipe of cases.filter((item) => item.provider)) {
                    const response = await service.fetch(
                        new Request(
                            `http://localhost:4180/__flow/previews?${new URLSearchParams({ flow, section, cases: recipe.id })}`,
                        ),
                    );
                    expect(await response?.json()).toMatchObject({
                        status: "ready",
                        stale: false,
                        cases: {
                            [recipe.id]: {
                                status: "reference",
                                provider: recipe.provider,
                            },
                        },
                    });
                }
            }
            expect(runtimeLoads).toBe(0);
        } finally {
            await service.close();
        }
    });

    it("rejects unknown cases and treats an empty selection as no work", async () => {
        let runtimeLoads = 0;
        const service = createCaptureService({
            source: () => source,
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => {
                runtimeLoads++;
                throw new Error("Empty selection needs no runtime");
            },
        });
        try {
            const request = (cases: string) =>
                service.fetch(
                    new Request(
                        `http://localhost:4180/__flow/previews?flow=app&section=main&cases=${cases}`,
                    ),
                );
            expect((await request("missing-case"))?.status).toBe(400);
            const initial = await (await request(""))?.json();
            expect(initial).toMatchObject({
                status: "ready",
                stale: false,
                cases: {},
            });
            service.invalidate();
            const refreshed = await (await request(""))?.json();
            expect(refreshed.revision).not.toBe(initial.revision);
            expect(runtimeLoads).toBe(0);
        } finally {
            await service.close();
        }
    });
});
