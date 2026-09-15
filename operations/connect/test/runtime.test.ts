import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
    apiErrorMessage,
    apiResponseError,
} from "../../../enter.pollinations.ai/frontend/src/lib/api-error.ts";
import { Pollinations } from "../../../packages/sdk/src/client.ts";
import { getDefaultErrorMessage } from "../../../shared/error.ts";
import { CALLBACK_URL, CLIENT_ID, USER_ID } from "../fixtures.ts";
import githubProfile from "../github-profile.json";
import { getFlowFocus } from "../pollen-connect-diagram";
import type { ReviewCase } from "../review-cases.ts";
import { reviewCasesForFlow, reviewPageForLocation } from "../review-inventory";
import { prepareReviewCase } from "../review-prepare.ts";
import { bundleWorkers, startRuntime } from "../runtime.ts";
import { screenRoute } from "../screen-route";

let runtime: Awaited<ReturnType<typeof startRuntime>>;
let server: ReturnType<typeof serve>;
let sdkBaseUrl: string;

beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
    server = serve({ fetch: runtime.fetch, hostname: "127.0.0.1", port: 0 });
    await once(server, "listening");
    sdkBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/gen`;
}, 60000);

afterAll(async () => {
    try {
        if (server)
            await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
        await runtime?.dispose();
        console.log("Connect disposable runtime disposed");
    }
});

test("preserves real Enter error responses through the product frontend", async () => {
    const request = (
        path: string,
        body?: unknown,
        cookie = "",
        method = body === undefined ? "GET" : "POST",
    ) =>
        runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method,
                headers: { cookie, "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
    const reset = await request("/__connect/reset", {});
    expect(reset.status).toBe(200);
    const cookie = reset.headers.get("set-cookie")?.split(";")[0] ?? "";
    await reset.body?.cancel();

    async function readFailure(
        response: Response,
        status: number,
        expectedMessage?: string,
    ) {
        expect(response.status).toBe(status);
        const payload = await response.clone().json();
        const error = await apiResponseError(response, "Request failed");
        const endpointMessage =
            typeof payload.error === "string"
                ? payload.error
                : (payload.error?.message ?? payload.message);
        expect(typeof endpointMessage).toBe("string");
        expect(error.message).toBe(endpointMessage);
        expect(error.cause).toBe(status);
        expect(apiErrorMessage(payload, "Request failed")).toBe(
            endpointMessage,
        );
        if (expectedMessage) expect(error.message).toBe(expectedMessage);
        return error;
    }

    // The actual code endpoint rejects the missing session before issuing a
    // code or using the inert key field. Its HTTP status must reach recovery.
    await readFailure(
        await request("/api/oauth/code", {
            apiKey: "invalid-error-probe",
            clientId: CLIENT_ID,
            redirectUri: CALLBACK_URL,
            codeChallenge: "A".repeat(43),
            codeChallengeMethod: "S256",
        }),
        401,
    );
    await readFailure(
        await request(
            "/api/stripe/auto-top-up",
            {
                enabled: true,
                packAmountUsd: 5,
            },
            "",
            "PATCH",
        ),
        401,
    );
    for (const path of [
        "/api/customer/balance",
        "/api/stripe/billing",
        "/api/stripe/checkout-status/cs_connect_review",
        "/api/account/integrations",
        "/api/account/integrations/toolkits",
    ])
        await readFailure(await request(path), 401);
    await readFailure(await request("/api/stripe/billing/portal", {}), 401);
    await readFailure(
        await request(
            "/api/auth/account-info?accountId=missing-review-account",
            undefined,
            cookie,
        ),
        400,
        "Account not found",
    );

    // An absent session is a valid null result; only missing provider details
    // should become a lookup error.
    const signedOutSession = await request("/api/auth/get-session");
    expect(signedOutSession.status).toBe(200);
    expect(await signedOutSession.json()).toBeNull();

    // Seed inert local account metadata and vary the provider response. The
    // actual Better Auth provider and Enter endpoint process every lookup.
    for (const discord of ["connected", "unavailable", "connected"]) {
        const prepared = await request("/__connect/review/prepare", {
            discord,
        });
        expect(prepared.status).toBe(200);
        await prepared.body?.cancel();
        const accounts = await (
            await request("/api/auth/list-accounts", undefined, cookie)
        ).json();
        const response = await request(
            "/api/auth/account-info?accountId=100000000000000001",
            undefined,
            cookie,
        );
        if (discord === "unavailable") {
            expect(await response.clone().json()).toMatchObject({
                code: "ACCOUNT_INFO_UNAVAILABLE",
            });
            await readFailure(
                response,
                502,
                "Could not load your connected account's details. Please try again.",
            );
        } else {
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                user: { id: "100000000000000001" },
                data: { username: "connect-review" },
            });
        }
        expect(
            await (
                await request("/api/auth/list-accounts", undefined, cookie)
            ).json(),
        ).toEqual(accounts);
    }

    // Exercise Enter's real device expiry guard. No key is minted and the
    // expired request cannot be approved or written to KV.
    expect(
        (await request("/__connect/review/prepare", { device: "expired" }))
            .status,
    ).toBe(200);
    const before = await (await request("/__connect/state")).json();
    await readFailure(
        await request(
            "/api/device/approve",
            {
                userCode: before.device.userCode,
                apiKey: "invalid-error-probe",
                apiKeyId: "invalid-error-probe",
            },
            cookie,
        ),
        400,
        "Device code expired",
    );

    // Stripe validation uses a string error, while an upstream failure goes
    // through Enter's shared nested envelope. Local outbound traffic is blocked;
    // these calls create no Stripe customer, portal session or charge.
    await readFailure(
        await request(
            "/api/stripe/auto-top-up",
            {
                enabled: true,
                packAmountUsd: -1,
            },
            cookie,
            "PATCH",
        ),
        400,
        "Invalid auto top-up pack amount.",
    );
    await readFailure(
        await request(
            "/api/stripe/auto-top-up",
            {
                enabled: true,
                packAmountUsd: 5,
            },
            cookie,
            "PATCH",
        ),
        500,
    );
    await readFailure(
        await request("/api/stripe/billing/portal", {}, cookie),
        500,
    );
    const after = await (await request("/__connect/state")).json();
    expect(after).toEqual(before);
    expect(
        (await (await request("/api/api-keys", undefined, cookie)).json()).data,
    ).toEqual([]);
    const faults = await (await request("/__connect/review/requests")).json();
    expect(faults).toEqual({ pending: [], consumed: [] });

    // Even a broken/empty error body must not discard 401 and strand sign-in.
    expect(
        await apiResponseError(
            new Response(null, { status: 401 }),
            "Sign-in required",
        ),
    ).toMatchObject({ message: "Sign-in required", cause: 401 });
});

const reviewOrigin = "http://localhost:4180";

// These navigation checks share disposable Workers, never the running lab's data.
async function openReviewContext(browser: Browser, recipe: ReviewCase) {
    const origin = reviewOrigin;
    const prepared = await prepareReviewCase(recipe, (path, body) =>
        runtime.fetch(
            new Request(`${origin}${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
        ),
    );
    const readState = async () =>
        (await runtime.fetch(new Request(`${origin}/__connect/state`))).json();
    const before = await readState();
    const context = await browser.newContext();
    try {
        const cookie = prepared.headers.get("set-cookie")?.split(";")[0];
        if (recipe.conditions.account === "signed-in" && cookie) {
            const separator = cookie.indexOf("=");
            await context.addCookies([
                {
                    name: cookie.slice(0, separator),
                    value: cookie.slice(separator + 1),
                    url: origin,
                    httpOnly: true,
                    sameSite: "Lax",
                },
            ]);
        }
        const credentialRequests: string[] = [];
        // Product requests go to disposable real Workers; Vite only
        // supplies source files. No response replaces Enter or Gen.
        await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) {
                if (url.href === githubProfile.avatar_url)
                    await route.continue();
                else await route.abort("blockedbyclient");
                return;
            }
            if (
                !/^\/(?:api|gen|__connect|auth|\.well-known)(?:\/|$)/.test(
                    url.pathname,
                )
            ) {
                await route.continue();
                return;
            }
            if (
                request.method() === "POST" &&
                [
                    "/api/api-keys",
                    "/api/oauth/code",
                    "/api/oauth/token",
                ].includes(url.pathname)
            )
                credentialRequests.push(url.pathname);
            const response = await runtime.fetch(
                new Request(request.url(), {
                    method: request.method(),
                    headers: request.headers(),
                    body: request.postDataBuffer(),
                }),
            );
            await route.fulfill({
                status: response.status,
                headers: Object.fromEntries(response.headers),
                body: Buffer.from(await response.arrayBuffer()),
            });
        });
        return { context, before, readState, credentialRequests };
    } catch (error) {
        await context.close();
        throw error;
    }
}

test.runIf(process.env.CONNECT_CAPTURE_TEST === "1")(
    "App cancellation Map edges follow real Enter and SDK navigation",
    async () => {
        const origin = "http://localhost:4180";
        const recipe = reviewCasesForFlow("app", "main").find(
            ({ id }) => id === "app-access-declined",
        );
        if (!recipe) throw new Error("Missing App cancellation situation");
        const { edges } = getFlowFocus("app", "main");
        const observerUrl = `/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`;
        const browser = await chromium.launch({ headless: true });
        try {
            for (const account of ["signed-in", "signed-out"] as const) {
                const { context, before, readState, credentialRequests } =
                    await openReviewContext(browser, {
                        ...recipe,
                        conditions: { ...recipe.conditions, account },
                    });
                try {
                    const page = await context.newPage();
                    let state: string | null = null;
                    const callbacks: {
                        error: string | null;
                        stateMatches: boolean;
                        hasCredential: boolean;
                    }[] = [];
                    page.on("request", (request) => {
                        if (!request.isNavigationRequest()) return;
                        const url = new URL(request.url());
                        if (url.pathname === "/authorize")
                            state = url.searchParams.get("state");
                        if (
                            url.pathname === "/connect-example.html" &&
                            url.searchParams.has("error")
                        )
                            callbacks.push({
                                error: url.searchParams.get("error"),
                                stateMatches:
                                    Boolean(state) &&
                                    url.searchParams.get("state") === state,
                                hasCredential: ["code", "key", "api_key"].some(
                                    (key) => url.searchParams.has(key),
                                ),
                            });
                    });
                    // Keep this import native to the browser rather than
                    // having Vitest rewrite it into a server-side import.
                    const observe = () =>
                        page.evaluate<string>(`(async () => {
                            const { observeScreen } = await import(${JSON.stringify(observerUrl)});
                            return observeScreen(document)?.node;
                        })()`);
                    const entry = screenRoute(
                        new URLSearchParams(recipe.query),
                        before,
                        origin,
                    );
                    if (!entry) throw new Error("Missing App entry route");
                    await page.goto(`${origin}${entry}`);
                    const connect = page.getByRole("button", {
                        name: "Connect with Pollinations",
                        exact: true,
                    });
                    await connect.waitFor();
                    expect(await observe()).toBe("app-connect");
                    await connect.click();
                    const heading =
                        account === "signed-in"
                            ? "#authorize-dialog-title"
                            : "#sign-in-title";
                    await page.locator(heading).waitFor();
                    const from = await observe();
                    expect(from).toBe(
                        account === "signed-in" ? "consent" : "sign-in",
                    );
                    await page
                        .getByRole("button", {
                            name: "Back to app",
                            exact: true,
                        })
                        .click();
                    await page
                        .locator('[data-connect-state="connection-error"]')
                        .waitFor();
                    const to = await observe();
                    expect(to).toBe(recipe.family);
                    expect(edges).toContainEqual(
                        expect.objectContaining({
                            from,
                            to: "cancelled",
                            label: "Back to app",
                        }),
                    );
                    expect(edges).toContainEqual(
                        expect.objectContaining({ from: "cancelled", to }),
                    );
                    expect(callbacks).toEqual([
                        {
                            error: "access_denied",
                            stateMatches: true,
                            hasCredential: false,
                        },
                    ]);
                    expect(new URL(page.url()).search).toBe("");
                    for (const expected of recipe.expected) {
                        const target = page.locator(expected.selector);
                        expect(
                            await (expected.text
                                ? target.filter({ hasText: expected.text })
                                : target
                            ).isVisible(),
                        ).toBe(true);
                    }
                    // The recovery control starts a fresh real authorization.
                    await connect.click();
                    await page.locator(heading).waitFor();
                    expect(await observe()).toBe(from);
                    expect(credentialRequests).toEqual([]);
                    expect(await readState()).toEqual(before);
                } finally {
                    await context.close();
                }
            }
        } finally {
            await browser.close();
        }
    },
    90_000,
);

test.runIf(process.env.CONNECT_CAPTURE_TEST === "1")(
    "Device cancellation and recovery Map edges follow real Enter navigation",
    async () => {
        const origin = reviewOrigin;
        const observerUrl = `/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`;
        const browser = await chromium.launch({ headless: true });
        const post = (path: string, body = {}) =>
            runtime.fetch(
                new Request(`${origin}${path}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }),
            );
        try {
            for (const section of ["main", "link"] as const) {
                const cases = reviewCasesForFlow("device", section);
                const { edges } = getFlowFocus("device", section);
                const edge = (from: string, to: string) =>
                    expect(edges).toContainEqual(
                        expect.objectContaining({ from, to }),
                    );
                for (const id of [
                    "device-declined",
                    "device-submit-deny",
                    "device-request-invalid",
                    "device-request-expired",
                    "device-request-used",
                    "device-request-unavailable",
                ]) {
                    const recipe = cases.find((item) => item.id === id);
                    if (!recipe)
                        throw new Error(`Missing Device situation: ${id}`);
                    const { context, before, readState, credentialRequests } =
                        await openReviewContext(browser, recipe);
                    try {
                        const page = await context.newPage();
                        const observe = () =>
                            page.evaluate<string>(`(async () => {
                            const { observeScreen } = await import(${JSON.stringify(observerUrl)});
                            return observeScreen(document)?.node;
                        })()`);
                        const mapNode = (node: string) =>
                            reviewPageForLocation(
                                { flow: "device", section },
                                { node, flow: "device" },
                            )?.node;
                        const entry = screenRoute(
                            new URLSearchParams(recipe.query),
                            before,
                            origin,
                        );
                        if (!entry)
                            throw new Error("Missing Device entry route");
                        await page.goto(`${origin}${entry}`);
                        if (id.startsWith("device-request-")) {
                            await page
                                .locator("#connection-error-title")
                                .waitFor();
                            expect(await observe()).toBe(id);
                            expect(mapNode(await observe())).toBe(
                                recipe.family,
                            );
                            const unavailable =
                                id === "device-request-unavailable";
                            const destination = unavailable
                                ? "device-checking"
                                : "device-code";
                            edge(recipe.family, destination);
                            if (unavailable) {
                                const cleared = await post(
                                    "/__connect/review/requests",
                                    [],
                                );
                                expect(cleared.ok).toBe(true);
                                await cleared.body?.cancel();
                            }
                            await page
                                .getByRole("button", {
                                    name: unavailable
                                        ? "Try again"
                                        : "Enter another code",
                                    exact: true,
                                })
                                .click();
                            if (unavailable) {
                                await page
                                    .getByRole("button", {
                                        name: "Allow access",
                                        exact: true,
                                    })
                                    .waitFor();
                                expect(await observe()).toBe("consent");
                                edge(destination, "consent");
                            } else {
                                await page
                                    .locator("#device-code-form")
                                    .waitFor();
                                expect(await observe()).toBe("device-code");
                                expect(new URL(page.url()).pathname).toBe(
                                    "/device",
                                );
                                expect(
                                    new URL(page.url()).searchParams.get(
                                        "user_code",
                                    ),
                                ).toBe("");
                            }
                            expect(await readState()).toEqual(before);
                        } else {
                            await page
                                .getByRole("button", {
                                    name: "Allow access",
                                    exact: true,
                                })
                                .waitFor();
                            expect(await observe()).toBe("consent");
                            edge("consent", "device-denying");
                            // Pause delivery, then let the exact request reach
                            // Enter. No fabricated pending/error response.
                            let continueDeny = () => {};
                            const delivery = new Promise<void>((resolve) => {
                                continueDeny = resolve;
                            });
                            await page.route(
                                "**/api/device/deny",
                                async (route) => {
                                    await delivery;
                                    await route.fallback();
                                },
                            );
                            try {
                                await page
                                    .getByRole("button", {
                                        name: "Cancel",
                                        exact: true,
                                    })
                                    .click();
                                await expect
                                    .poll(observe)
                                    .toBe("device-denying");
                            } finally {
                                continueDeny();
                            }
                            if (id === "device-submit-deny") {
                                await page
                                    .locator("#connection-error-title")
                                    .waitFor();
                                expect(
                                    await page.getByRole("alert").textContent(),
                                ).toContain("Couldn’t decline this connection");
                                expect(await observe()).toBe(id);
                                expect(mapNode(await observe())).toBe(
                                    recipe.family,
                                );
                                edge("device-denying", recipe.family);
                                edge(recipe.family, "device-checking");
                                // A failed write must leave the request pending.
                                expect(await readState()).toEqual(before);
                                const cleared = await post(
                                    "/__connect/review/requests",
                                    [],
                                );
                                expect(cleared.ok).toBe(true);
                                await cleared.body?.cancel();
                                await page
                                    .getByRole("button", {
                                        name: "Try again",
                                        exact: true,
                                    })
                                    .click();
                                await page
                                    .getByRole("button", {
                                        name: "Allow access",
                                        exact: true,
                                    })
                                    .waitFor();
                                expect(await observe()).toBe("consent");
                                edge("device-checking", "consent");
                                await page
                                    .getByRole("button", {
                                        name: "Cancel",
                                        exact: true,
                                    })
                                    .click();
                            }
                            await page
                                .locator("#device-result-title")
                                .waitFor();
                            expect(
                                await page
                                    .locator("#device-result-title")
                                    .textContent(),
                            ).toBe("Connection declined");
                            expect(await observe()).toBe("device-declined");
                            edge("device-denying", "device-declined");
                            const declined = await readState();
                            expect(declined).toEqual({
                                ...before,
                                device: { ...before.device, status: "denied" },
                            });
                            const polled = await post("/__connect/device/poll");
                            expect(polled.ok).toBe(true);
                            await polled.body?.cancel();
                            expect(await readState()).toEqual(declined);
                            edge("device-declined", "device-stopped");
                        }
                        expect(credentialRequests).toEqual([]);
                        expect((await readState()).connection.keyId).toBeNull();
                    } finally {
                        await context.close();
                    }
                }
            }
        } finally {
            await browser.close();
        }
    },
    90_000,
);

for (const id of [
    "device-request-app",
    "device-request-lookup",
    "device-submit-key",
    "device-submit-session",
    "device-submit-approve",
]) {
    test.runIf(
        process.env.CONNECT_CAPTURE_TEST === "1" &&
            (id !== "device-submit-approve" ||
                process.env.CONNECT_DEVICE_APPROVAL_ERROR_TEST === "1"),
    )(
        `Device lookup and approval recovery: ${id}`,
        async () => {
            const browser = await chromium.launch({ headless: true });
            const observerUrl = `/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`;
            try {
                for (const section of ["main", "link"] as const) {
                    const recipe = reviewCasesForFlow("device", section).find(
                        (item) => item.id === id,
                    );
                    if (!recipe)
                        throw new Error(`Missing Device situation: ${id}`);
                    const { context, before, readState, credentialRequests } =
                        await openReviewContext(browser, recipe);
                    try {
                        const { edges } = getFlowFocus("device", section);
                        const edge = (from: string, to: string) =>
                            expect(edges).toContainEqual(
                                expect.objectContaining({ from, to }),
                            );
                        const page = await context.newPage();
                        const approvalResponses: {
                            path: string;
                            status: number;
                            ok: boolean;
                        }[] = [];
                        page.on("response", (response) => {
                            const path = new URL(response.url()).pathname;
                            if (
                                response.request().method() === "POST" &&
                                [
                                    "/api/api-keys",
                                    "/api/device/approve",
                                ].includes(path)
                            )
                                approvalResponses.push({
                                    path,
                                    status: response.status(),
                                    ok: response.ok(),
                                });
                        });
                        const observe = () =>
                            page.evaluate<string>(`(async () => {
                        const { observeScreen } = await import(${JSON.stringify(observerUrl)});
                        return observeScreen(document)?.node;
                    })()`);
                        const entry = screenRoute(
                            new URLSearchParams(recipe.query),
                            before,
                            reviewOrigin,
                        );
                        if (!entry)
                            throw new Error("Missing Device entry route");
                        await page.goto(`${reviewOrigin}${entry}`);
                        if (id.startsWith("device-submit-")) {
                            const allow = page.getByRole("button", {
                                name: "Allow access",
                                exact: true,
                            });
                            await allow.waitFor();
                            expect(await observe()).toBe("consent");
                            edge("consent", "device-approving");
                            // Hold the actual key request until the pending UI has
                            // been observed. The configured fault still owns its response.
                            let deliver = () => {};
                            const delivery = new Promise<void>((resolve) => {
                                deliver = resolve;
                            });
                            await page.route(
                                "**/api/api-keys",
                                async (route) => {
                                    if (route.request().method() === "POST")
                                        await delivery;
                                    await route.fallback();
                                },
                            );
                            try {
                                await allow.click();
                                await expect
                                    .poll(observe)
                                    .toBe("device-approving");
                            } finally {
                                deliver();
                            }
                        }
                        const expiredSession = id === "device-submit-session";
                        await page
                            .locator(
                                expiredSession
                                    ? "#sign-in-title"
                                    : "#connection-error-title",
                            )
                            .waitFor();
                        for (const expected of recipe.expected) {
                            await page
                                .locator(expected.selector)
                                .filter(
                                    expected.text
                                        ? { hasText: expected.text }
                                        : {},
                                )
                                .waitFor();
                        }
                        const observed = await observe();
                        expect(approvalResponses).toEqual(
                            id === "device-submit-approve"
                                ? [
                                      expect.objectContaining({
                                          path: "/api/api-keys",
                                          ok: true,
                                      }),
                                      {
                                          path: "/api/device/approve",
                                          status: 500,
                                          ok: false,
                                      },
                                  ]
                                : id.startsWith("device-submit-")
                                  ? [
                                        {
                                            path: "/api/api-keys",
                                            status: expiredSession ? 401 : 500,
                                            ok: false,
                                        },
                                    ]
                                  : [],
                        );
                        const visible = reviewPageForLocation(
                            { flow: "device", section },
                            { node: observed, flow: "device" },
                        );
                        expect(visible?.node).toBe(recipe.family);
                        expect(visible?.entry.id).toBe(
                            expiredSession ? "sign-in-errors" : "device-errors",
                        );
                        edge(
                            id.startsWith("device-submit-")
                                ? "device-approving"
                                : "device-checking",
                            recipe.family,
                        );
                        expect(await readState()).toEqual(before);
                        if (expiredSession) {
                            // Stop at the real sign-in action: completing OAuth is
                            // a separate, credential-creating verification batch.
                            expect(
                                await page
                                    .getByRole("button", {
                                        name: "Sign in again",
                                        exact: true,
                                    })
                                    .isVisible(),
                            ).toBe(true);
                            expect(
                                await page
                                    .getByRole("button", {
                                        name: "Cancel",
                                        exact: true,
                                    })
                                    .count(),
                            ).toBe(0);
                            edge(recipe.family, "device-signing-in");
                        } else {
                            const retry = page.getByRole("button", {
                                name: "Try again",
                                exact: true,
                            });
                            if (id === "device-request-app") {
                                expect(await retry.count()).toBe(0);
                            } else {
                                edge(recipe.family, "device-checking");
                                if (id === "device-request-lookup") {
                                    const restored = await runtime.fetch(
                                        new Request(
                                            `${reviewOrigin}/__connect/review/requests`,
                                            {
                                                method: "POST",
                                                headers: {
                                                    "Content-Type":
                                                        "application/json",
                                                },
                                                body: "[]",
                                            },
                                        ),
                                    );
                                    expect(restored.ok).toBe(true);
                                    await restored.body?.cancel();
                                }
                                const writesBeforeRetry = [
                                    ...credentialRequests,
                                ];
                                await retry.click();
                                await page
                                    .getByRole("button", {
                                        name: "Allow access",
                                        exact: true,
                                    })
                                    .waitFor();
                                expect(await observe()).toBe("consent");
                                expect(credentialRequests).toEqual(
                                    writesBeforeRetry,
                                );
                                edge("device-checking", "consent");
                            }
                            // A confirmed unknown app can only be declined. For a
                            // retriable error, cancel after the real recheck succeeds.
                            edge(
                                id === "device-request-app"
                                    ? recipe.family
                                    : "consent",
                                "device-denying",
                            );
                            await page
                                .getByRole("button", {
                                    name: "Cancel",
                                    exact: true,
                                })
                                .click();
                            await page
                                .locator("#device-result-title")
                                .waitFor();
                            expect(await observe()).toBe("device-declined");
                            expect((await readState()).device.status).toBe(
                                "denied",
                            );
                        }
                        expect(credentialRequests).toEqual(
                            id.startsWith("device-submit-")
                                ? ["/api/api-keys"]
                                : [],
                        );
                        expect((await readState()).connection.keyId).toBeNull();
                    } finally {
                        await context.close();
                    }
                }
            } finally {
                await browser.close();
            }
        },
        90_000,
    );
}

test
    .runIf(process.env.CONNECT_AUTHORIZATION_CLEANUP_TEST === "1")
    .each(["device-network", "device-cleanup-error", "app-http"])(
    "authorization key cleanup: %s",
    async (mode) => {
        const app = mode === "app-http";
        const failedCleanup = mode === "device-cleanup-error";
        const network = mode === "device-network";
        const recipe = reviewCasesForFlow(app ? "app" : "device", "main").find(
            ({ id }) =>
                id === (app ? "consent-failed-code" : "device-submit-approve"),
        );
        if (!recipe) throw new Error("Missing authorization failure situation");
        const browser = await chromium.launch({ headless: true });
        try {
            const { context, before, readState } = await openReviewContext(
                browser,
                {
                    ...recipe,
                    requests: [
                        ...(network ? [] : (recipe.requests ?? [])),
                        ...(failedCleanup
                            ? ([
                                  {
                                      path: "/api/auth/api-key/delete",
                                      method: "POST",
                                      outcome: "forbidden",
                                  },
                              ] as const)
                            : []),
                    ],
                },
            );
            try {
                const page = await context.newPage();
                if (network)
                    await page.route("**/api/device/approve", (route) =>
                        route.abort("failed"),
                    );
                const deletions: number[] = [];
                page.on("response", (response) => {
                    if (
                        new URL(response.url()).pathname ===
                        "/api/auth/api-key/delete"
                    )
                        deletions.push(response.status());
                });
                const entry = screenRoute(
                    new URLSearchParams(recipe.query),
                    before,
                    reviewOrigin,
                );
                if (!entry) throw new Error("Missing authorization route");
                await page.goto(`${reviewOrigin}${entry}`);
                const createdResponse = page.waitForResponse(
                    (response) =>
                        new URL(response.url()).pathname === "/api/api-keys" &&
                        response.request().method() === "POST",
                );
                await page
                    .getByRole("button", { name: "Allow access", exact: true })
                    .click();
                const created = await createdResponse;
                expect(created.ok()).toBe(true);
                // Use the approved disposable credential only inside this test;
                // neither its value nor API response bodies are logged.
                const { key } = await created.json();
                await page.locator("#connection-error-title").waitFor();
                const alert = await page.getByRole("alert").textContent();
                expect(alert).toContain(
                    network ? "Failed to fetch" : getDefaultErrorMessage(500),
                );
                expect(deletions).toEqual([failedCleanup ? 403 : 200]);
                if (failedCleanup) {
                    expect(alert).toContain(
                        `Key cleanup failed: ${getDefaultErrorMessage(403)}`,
                    );
                    expect(alert).toContain(
                        "Delete the unused key from API keys.",
                    );
                    expect((await readState()).connection.enabled).toBe(true);
                } else {
                    expect(alert).not.toContain("Key cleanup failed");
                    expect(await readState()).toEqual(before);
                }
                const keyCheck = await runtime.fetch(
                    new Request(`${reviewOrigin}/gen/account/key`, {
                        headers: { authorization: `Bearer ${key}` },
                    }),
                );
                expect(keyCheck.status).toBe(failedCleanup ? 200 : 401);
                await keyCheck.body?.cancel();
            } finally {
                await context.close();
            }
        } finally {
            await browser.close();
        }
    },
    60_000,
);

test("real Enter session, PKCE grant and SDK→Gen→Enter share the local account", async () => {
    let cookie = "";
    async function request(path: string, body?: unknown) {
        const response = await runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: {
                    cookie,
                    ...(body === undefined
                        ? {}
                        : { "Content-Type": "application/json" }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            }),
        );
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";")[0];
        return response;
    }

    expect((await request("/__connect/state")).status).toBe(409);
    const reset = await request("/__connect/reset", {});
    expect(reset.status).toBe(200);
    expect(cookie.startsWith("better-auth.session_token=")).toBe(true);
    const session = await request("/api/auth/get-session");
    expect(session.status).toBe(200);
    expect((await session.json()).user?.id).toBe(USER_ID);
    const sessionBalance = await request("/api/account/balance");
    expect((await sessionBalance.json()).accountBalance).toEqual({
        total: 10,
        tier: 0,
        paid: 10,
    });

    const app = await request(`/api/app-lookup?client_id=${CLIENT_ID}`);
    expect((await app.json()).found).toBe(true);
    // This is the real consent screen's sequence: mint scoped key, create
    // single-use code, exchange with PKCE. No fixture bearer key is supplied.
    const created = await request("/api/api-keys", {
        name: "Connect Example",
        type: "secret",
        pollenBudget: 5,
        accountPermissions: ["profile", "usage"],
        metadata: { requestedClientId: CLIENT_ID, redirectUri: CALLBACK_URL },
    });
    expect(created.status).toBe(200);
    const createdKey = await created.json();
    expect(typeof createdKey.key === "string").toBe(true);
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const codeResponse = await request("/api/oauth/code", {
        apiKey: createdKey.key,
        clientId: CLIENT_ID,
        redirectUri: CALLBACK_URL,
        scope: "profile usage",
        codeChallenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
        codeChallengeMethod: "S256",
    });
    expect(codeResponse.status).toBe(200);
    const { code } = await codeResponse.json();
    const exchange = {
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        code_verifier: verifier,
    };
    const tokenResponse = await request("/api/oauth/token", exchange);
    expect(tokenResponse.status).toBe(200);
    const token = await tokenResponse.json();
    expect(typeof token.access_token === "string").toBe(true);
    expect((await request("/api/oauth/token", exchange)).status).toBe(400);

    const sdk = new Pollinations({
        apiKey: token.access_token,
        baseUrl: sdkBaseUrl,
    });
    expect((await sdk.accountProfile()).githubUsername).toBe(
        "pollinationsagent",
    );
    const keyWithEnterCookie = await runtime.fetch(
        new Request("http://localhost:4180/gen/account/key", {
            headers: { cookie, authorization: `Bearer ${token.access_token}` },
        }),
    );
    expect(keyWithEnterCookie.status).toBe(200);
    expect((await keyWithEnterCookie.json()).id).toBe(createdKey.id);
    expect(await sdk.accountBalance()).toEqual({
        balance: 5,
        accountBalance: { total: 10, tier: 0, paid: 10 },
    });
    const connected = await request("/__connect/state");
    expect((await connected.json()).connection.keyId).toBe(createdKey.id);

    await request("/__connect/conditions", { pollen: "quest" });
    expect((await sdk.accountBalance()).accountBalance).toEqual({
        total: 5,
        tier: 5,
        paid: 0,
    });
    await request("/__connect/conditions", { pollen: "empty" });
    expect((await sdk.accountBalance()).accountBalance?.total).toBe(0);
    await expect(
        sdk.text("Local preflight", { model: "openai" }),
    ).rejects.toMatchObject({ status: 402 });

    await request("/__connect/conditions", {
        pollen: "paid",
        allowance: "exhausted",
    });
    expect((await sdk.accountBalance()).balance).toBe(0);
    await expect(
        sdk.text("Local allowance preflight", { model: "openai" }),
    ).rejects.toMatchObject({ status: 402 });
    await request("/__connect/conditions", { account: "banned" });
    await expect(sdk.accountProfile()).rejects.toMatchObject({ status: 403 });

    const signedOut = await request("/__connect/conditions", {
        account: "signed-out",
    });
    expect(signedOut.headers.get("set-cookie")?.includes("Max-Age=0")).toBe(
        true,
    );
    expect(await (await request("/api/auth/get-session")).json()).toBeNull();
    expect((await request("/api/account/profile")).status).toBe(401);
    await request("/__connect/conditions", { account: "signed-in" });
    expect((await request("/api/auth/sign-out", {})).status).toBe(200);
    expect(
        (await (await request("/__connect/state")).json()).conditions.account,
    ).toBe("signed-out");
    await request("/__connect/reset", {});
    await expect(sdk.accountProfile()).rejects.toMatchObject({ status: 401 });
}, 60000);

test("CONNECT_DEVICE_TEST_KEY completes real device approval and Gen→Enter verification", async () => {
    let keyCreationAttempted = false;
    let keyCreated = false;
    try {
        const reset = await runtime.fetch(
            new Request("http://localhost:4180/__connect/reset", {
                method: "POST",
            }),
        );
        expect(reset.status).toBe(200);
        const cookie = reset.headers.get("set-cookie")?.split(";")[0] ?? "";
        async function request(path: string, body?: unknown) {
            return runtime.fetch(
                new Request(`http://localhost:4180${path}`, {
                    method: body === undefined ? "GET" : "POST",
                    headers: { cookie, "Content-Type": "application/json" },
                    body: body === undefined ? undefined : JSON.stringify(body),
                }),
            );
        }

        expect((await reset.json()).device).toBeNull();
        expect((await request("/__connect/device/poll", {})).status).toBe(400);
        const started = await request("/__connect/device/start", {});
        expect(started.status).toBe(200);
        expect(started.headers.has("set-cookie")).toBe(false);
        const { device } = await started.json();
        expect(device.status).toBe("pending");
        expect(device.userCode).toMatch(/^[A-Z2-9]{8}$/);
        expect(device.verificationUri).toBe("http://localhost:4180/device");
        expect(device.verificationUriComplete).toBe(
            `http://localhost:4180/device?user_code=${device.userCode}`,
        );
        expect(Object.keys(device).sort()).toEqual([
            "status",
            "userCode",
            "verificationUri",
            "verificationUriComplete",
        ]);
        expect(
            (await (await request("/__connect/state")).json()).device,
        ).toEqual(device);
        const changed = await request("/__connect/conditions", {
            pollen: "quest",
        });
        expect(
            changed.headers.get("set-cookie")?.split(";")[0] === cookie,
        ).toBe(true);
        expect((await changed.json()).device).toEqual(device);
        expect(
            (await (await request("/__connect/device/poll", {})).json()).device
                .status,
        ).toBe("pending");
        const info = await request(
            `/api/device/info?user_code=${device.userCode}`,
        );
        expect(await info.json()).toMatchObject({
            status: "pending",
            clientId: CLIENT_ID,
        });

        keyCreationAttempted = true;
        const created = await request("/api/api-keys", {
            name: "CONNECT_DEVICE_TEST_KEY",
            type: "secret",
            pollenBudget: 5,
            accountPermissions: ["profile", "usage"],
            metadata: {
                requestedClientId: CLIENT_ID,
                deviceUserCode: device.userCode,
            },
        });
        keyCreated = created.status === 200;
        expect(created.status).toBe(200);
        const key = await created.json();
        const approve = await request("/api/device/approve", {
            userCode: device.userCode,
            apiKey: key.key,
            apiKeyId: key.id,
            scope: "profile usage",
        });
        expect(approve.status).toBe(200);
        expect(
            (await (await request("/__connect/state")).json()).device.status,
        ).toBe("approved");
        const completed = await request("/__connect/device/poll", {});
        expect(completed.status).toBe(200);
        const state = await completed.json();
        expect(state.device.status).toBe("completed");
        expect(state.connection.keyId).toBe(key.id);
        expect(JSON.stringify(state).includes(key.key)).toBe(false);
        expect(
            (await (await request("/__connect/device/poll", {})).json()).device
                .status,
        ).toBe("completed");
        expect(
            (await request(`/api/device/info?user_code=${device.userCode}`))
                .status,
        ).toBe(400);

        const denied = await (
            await request("/__connect/device/start", {})
        ).json();
        expect(
            (
                await request("/api/device/deny", {
                    userCode: denied.device.userCode,
                })
            ).status,
        ).toBe(200);
        expect(
            (await (await request("/__connect/device/poll", {})).json()).device
                .status,
        ).toBe("denied");
        expect(
            (await (await request("/__connect/reset", {})).json()).device,
        ).toBeNull();
        expect(
            (
                await request(
                    `/api/device/info?user_code=${denied.device.userCode}`,
                )
            ).status,
        ).toBe(400);
    } catch (error) {
        console.error(
            `CONNECT_DEVICE_TEST_KEY creation attempted: ${keyCreationAttempted ? "yes" : "no"}; confirmed successful: ${keyCreated ? "yes" : "no"}`,
        );
        throw error;
    }
}, 60000);

test("disposes local Workers with an unread response body", async () => {
    const response = await runtime.fetch(
        new Request(
            "http://localhost:4180/api/app-lookup?client_id=pk_disposal_test",
        ),
    );
    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
    // Intentionally leave the body unread. afterAll must still dispose the runtime.
});

test("prepares the same isolated account after earlier review data", async () => {
    const recipe: ReviewCase = {
        id: "preparation-test",
        pageId: "keys",
        family: "keys",
        title: "Keys",
        query: { screen: "dash-keys" },
        conditions: { account: "signed-in", pollen: "quest" },
        prepare: { dashboard: "populated" },
        expected: [{ selector: "h1" }],
    };
    const post = (path: string, body?: unknown) =>
        runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
    async function snapshot(selected: ReviewCase) {
        const session = await prepareReviewCase(selected, post);
        const cookie =
            session.headers
                .getSetCookie()
                .find((value) => value.startsWith("better-auth.session_token="))
                ?.split(";")[0] ?? "";
        async function read(path: string) {
            const response = await runtime.fetch(
                new Request(`http://localhost:4180${path}`, {
                    headers: { cookie },
                }),
            );
            expect(response.status).toBe(200);
            return response.json();
        }
        const state = await read("/__connect/state");
        return {
            conditions: state.conditions,
            connection: state.connection,
            keys: await read("/api/api-keys"),
            balance: await read("/api/account/balance"),
        };
    }
    const populated = await snapshot(recipe);
    const empty = await snapshot({
        ...recipe,
        conditions: { pollen: "empty" },
        prepare: { dashboard: "empty" },
    });
    expect(empty.connection.keyId).toBeNull();
    expect(empty.balance.accountBalance.total).toBe(0);
    expect(populated.connection.keyId).toBe("connect-review-key");
    expect(populated.balance.accountBalance).toEqual({
        total: 5,
        tier: 5,
        paid: 0,
    });
    const repeated = await snapshot(recipe);
    expect(repeated.conditions).toEqual(populated.conditions);
    expect(repeated.connection).toEqual(populated.connection);
    expect(repeated.balance.accountBalance).toEqual(
        populated.balance.accountBalance,
    );
    expect(JSON.stringify(empty.keys)).not.toContain("connect-review-key");
    expect(JSON.stringify(repeated.keys)).toContain("connect-review-key");
});

test("opening review state preserves prepared data and faults and reuses the existing session", async () => {
    const request = (path: string, body?: unknown, cookie = "") =>
        runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: { cookie, "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
    await (await request("/__connect/reset", {})).body?.cancel();
    await (
        await request("/__connect/review/prepare", {
            rewards: "claimed",
            payment: "credited",
            billing: "enabled",
            connections: "available",
        })
    ).body?.cancel();
    const faults = [{ path: "/api/app-lookup", outcome: "unavailable" }];
    await (await request("/__connect/review/requests", faults)).body?.cancel();
    await (
        await request("/__connect/outcome", { signIn: "fail-next" })
    ).body?.cancel();

    let cookie = "";
    const scripts = await bundleWorkers();
    for (let tab = 0; tab < 2; tab++) {
        if (tab === 1) await runtime.reload(scripts);
        // A newly opened tab supplies no cookie. Reading must select the
        // existing session without preparing the account again.
        const response = await request("/__connect/state");
        expect(response.status).toBe(200);
        cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
        expect(cookie.startsWith("better-auth.session_token=")).toBe(true);
        const state = await response.json();
        expect(state.wallet).toEqual({
            questPollen: 5,
            paidPollen: 15,
            total: 20,
        });
        expect(state.conditions.account).toBe("signed-in");
        expect(state.connection.keyId).toBeNull();
        const session = await (
            await request("/api/auth/get-session", undefined, cookie)
        ).json();
        expect(session.session.id).toBe("connect-local-session");
        expect(
            (await request("/api/account/integrations", undefined, cookie))
                .status,
        ).toBe(200);
        expect(await (await request("/__connect/outcome")).json()).toEqual({
            signIn: "fail-next",
        });
        expect(
            (await (await request("/__connect/review/requests")).json())
                .pending,
        ).toEqual(faults);
    }
    expect((await request("/api/auth/sign-out", {}, cookie)).status).toBe(200);
    await runtime.reload(scripts);
    const signedOut = await request("/__connect/state");
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await signedOut.json()).conditions.account).toBe("signed-out");
});

test("serves healthy quests and earnings through Enter without scenario-specific service switches", async () => {
    let cookie = "";
    async function request(path: string, body?: unknown) {
        const response = await runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: { cookie, "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
        const nextCookie = response.headers.get("set-cookie");
        if (nextCookie) cookie = nextCookie.split(";")[0];
        return response;
    }
    for (const rewards of [
        undefined,
        "empty",
        "available",
        "claimed",
    ] as const) {
        await (await request("/__connect/reset", {})).body?.cancel();
        if (rewards)
            await (
                await request("/__connect/review/prepare", { rewards })
            ).body?.cancel();
        const catalog = await request("/api/quests/catalog");
        expect(catalog.status).toBe(200);
        expect((await catalog.json()).quests).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "first_api_key",
                    category: "setup",
                }),
            ]),
        );
        const earnings = await request("/api/customer/balance/today");
        expect(earnings.status).toBe(200);
        expect(await earnings.json()).toEqual({ paidWeek: 0, tierWeek: 0 });
        const checked = await request("/api/quests/check", {});
        expect(checked.status).toBe(200);
        expect(await checked.json()).toMatchObject({
            success: true,
            recorded: 0,
            rewardIds: [],
        });
        const list = await (await request("/api/quests/rewards")).json();
        expect(list.rewards).toHaveLength(
            rewards === undefined ? 2 : rewards === "empty" ? 0 : 1,
        );
        if (rewards === "available" || rewards === "claimed") {
            expect(list.rewards[0].pollenAmount).toBe(5);
            expect(list.rewards[0].claimedAt === null).toBe(
                rewards === "available",
            );
        }
    }
    // Faults still exercise the real error path; clearing them restores the
    // same services without replacing Enter's catalog or balance handler.
    await (
        await request("/__connect/review/requests", [
            { path: "/api/quests/catalog", outcome: "unavailable" },
        ])
    ).body?.cancel();
    expect((await request("/api/quests/catalog")).status).toBe(503);
    await (await request("/__connect/review/requests", [])).body?.cancel();
    expect((await request("/api/quests/catalog")).status).toBe(200);
});

test("applies review failures before the real Admin handler and restores it", async () => {
    const request = (path: string, body?: unknown) =>
        runtime.fetch(
            new Request(`http://localhost:4180${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: { "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
    await (await request("/__connect/reset", {})).body?.cancel();
    await (
        await request("/__connect/review/requests", [
            { path: "/auth/session", outcome: "unavailable" },
        ])
    ).body?.cancel();
    const failure = await request("/auth/session");
    expect(failure.status).toBe(503);
    expect((await failure.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    await (await request("/__connect/review/requests", [])).body?.cancel();
    const restored = await request("/auth/session");
    // The native Admin endpoint reports a signed-out session as 401.
    expect(restored.status).toBe(401);
    expect((await restored.json()).user).toBeNull();
});

test("public GitHub identity survives local conditions and repeated resets", async () => {
    for (let repeat = 0; repeat < 2; repeat++) {
        const reset = await runtime.fetch(
            new Request("http://localhost:4180/__connect/reset", {
                method: "POST",
            }),
        );
        expect(reset.status).toBe(200);
        const cookie = reset.headers.get("set-cookie")?.split(";")[0] ?? "";
        const profile = async () => {
            const response = await runtime.fetch(
                new Request("http://localhost:4180/api/auth/get-session", {
                    headers: { cookie },
                }),
            );
            expect(response.ok).toBe(true);
            expect((await response.json()).user).toMatchObject({
                id: USER_ID,
                name: githubProfile.name,
                githubUsername: githubProfile.login,
                githubId: githubProfile.id,
                image: githubProfile.avatar_url,
            });
        };
        await profile();
        const changed = await runtime.fetch(
            new Request("http://localhost:4180/__connect/conditions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pollen: "empty", role: "admin" }),
            }),
        );
        expect(changed.ok).toBe(true);
        expect(await changed.json()).toMatchObject({
            wallet: { paidPollen: 0, questPollen: 0 },
            user: { role: "admin" },
        });
        await profile();
    }
}, 30_000);
