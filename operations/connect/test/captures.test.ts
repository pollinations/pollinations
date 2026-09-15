import { HIGHLIGHTS_RAW_URL } from "@frontend/components/news-faq/highlights";
import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { getDefaultErrorMessage } from "../../../shared/error";
import type { PreviewResult } from "../capture-types";
import { captureIdentity, createCaptureService } from "../captures";
import githubProfile from "../github-profile.json";
import type { ReviewCase } from "../review-cases";
import { reviewCasesForFlow, reviewFlows } from "../review-inventory";

async function capture(
    service: ReturnType<typeof createCaptureService>,
    flow: string,
    section: string,
    id: string,
    presentation = { theme: "dark", size: "mobile" },
) {
    const request = new Request(
        `http://localhost:4180/__connect/previews?${new URLSearchParams({
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

it.runIf(process.env.CONNECT_CAPTURE_TEST === "1")(
    "verifies Account settings controls and rejects mismatched connection states",
    async () => {
        const { startRuntime } = await import("../runtime");
        const recipes = reviewCasesForFlow("account", "account").filter(
            ({ pageId }) => pageId === "account",
        );
        let probe: ReviewCase | undefined;
        const service = createCaptureService({
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

it.runIf(process.env.CONNECT_CAPTURE_TEST === "1")(
    "captures real News content and rejects missing or failed feeds",
    async () => {
        const { startRuntime } = await import("../runtime");
        let fault: "blocked" | "empty" | "http-error" | undefined;
        let feedBody = "";
        // Exercise the real page with transport failures, without adding fault
        // hooks to Enter or creating replacement News markup in Connect.
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

// Requires Connect's local dev server for the source UI. API traffic and data
// stay in a disposable runtime; these cases never issue reusable credentials.
it.runIf(process.env.CONNECT_CAPTURE_TEST === "1")(
    "captures real funding, wallet, quest and model situations and rejects mismatched pages or states",
    async () => {
        const { startRuntime } = await import("../runtime");
        let wrongRoute = false;
        let wrongError = false;
        let wrongSituation: string | undefined;
        let walletProbe: ReviewCase | undefined;
        const service = createCaptureService({
            loadCases: async () => ({
                reviewCasesForFlow: (flow, section) =>
                    reviewCasesForFlow(flow, section).map((item) => {
                        if (walletProbe?.id === item.id) return walletProbe;
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
                // selection, not a Connect-built representation of the state.
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
            const credited = reviewCasesForFlow("account", "topup").find(
                (item) => item.prepare?.payment === "credited",
            );
            if (!credited) throw new Error("Missing credited wallet situation");
            const wallet = await captureCase("account", "topup", credited.id);
            expect(
                wallet.status,
                wallet.status === "error" ? wallet.error : undefined,
            ).toBe("ready");
            expect(wallet).toMatchObject({
                status: "ready",
                entryRoute: "/pollen",
                finalRoute: "/pollen",
            });
            if (wallet.status !== "ready")
                throw new Error("Wallet capture failed");
            const document = await service.fetch(
                new Request(`http://localhost:4180${wallet.document}`),
            );
            expect(document?.headers.get("Content-Security-Policy")).toContain(
                "https://avatars.githubusercontent.com",
            );
            const html = await document?.text();
            expect(html).toContain(githubProfile.avatar_url);
            expect(html).toContain(githubProfile.login);
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
            for (const flow of ["account", "app"]) {
                for (const item of reviewCasesForFlow(flow, "topup").filter(
                    (item) =>
                        [
                            "Paid available",
                            "Quest only",
                            "Empty",
                            "Loading",
                            "Load failed",
                            "Session expired",
                            "Billing session expired",
                        ].includes(item.variant ?? ""),
                )) {
                    const result = await captureCase(flow, "topup", item.id);
                    expect(
                        result.status,
                        `${item.title}: ${result.status === "error" ? result.error : ""}`,
                    ).toBe("ready");
                }
                // The same recovery UI must also handle balance, checkout-status
                // and portal failures. Reuse their real entry routes and actions;
                // only the HTTP response changes, so no extra situation buttons
                // or endpoint-specific product logic are needed.
                for (const [variant, path] of [
                    ["Session expired", "/api/customer/balance"],
                    ["Payment check failed", "/api/stripe/checkout-status/*"],
                    ["Billing handoff failed", "/api/stripe/billing/portal"],
                ]) {
                    const item = reviewCasesForFlow(flow, "topup").find(
                        (item) => item.variant === variant,
                    );
                    if (!item)
                        throw new Error(`Missing wallet case: ${variant}`);
                    walletProbe = {
                        ...item,
                        requests: item.requests?.map((rule) => ({
                            ...rule,
                            path,
                            outcome: "unauthorized",
                        })),
                        expected: [
                            {
                                selector: '[role="alert"]',
                                text: getDefaultErrorMessage(401),
                            },
                            {
                                selector: "button:not(:disabled)",
                                text: "Sign in again",
                            },
                            {
                                selector:
                                    'body:not(:has(button:text-is("Try again")))',
                            },
                        ],
                    };
                    const result = await captureCase(flow, "topup", item.id);
                    expect(
                        result.status,
                        `${flow}: ${path}: ${result.error ?? ""}`,
                    ).toBe("ready");
                    walletProbe = undefined;
                }
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
            loadCases: async () => ({ reviewCasesForFlow }),
            loadRuntime: async () => {
                runtimeLoads++;
                throw new Error("External references need no runtime");
            },
        });
        try {
            const response = await service.fetch(
                new Request(
                    "http://localhost:4180/__connect/previews?flow=app&section=main&cases=github-handoff",
                ),
            );
            expect(await response?.json()).toMatchObject({
                status: "ready",
                stale: false,
                cases: {
                    "github-handoff": {
                        status: "reference",
                        provider: "GitHub",
                    },
                },
            });
            expect(runtimeLoads).toBe(0);
        } finally {
            await service.close();
        }
    });

    it("rejects unknown cases and treats an empty selection as no work", async () => {
        let runtimeLoads = 0;
        const service = createCaptureService({
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
                        `http://localhost:4180/__connect/previews?flow=app&section=main&cases=${cases}`,
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
