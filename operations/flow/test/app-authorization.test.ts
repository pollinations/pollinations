import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Pollinations } from "../../../packages/sdk/src/client.ts";
import { CLIENT_ID, USER_ID } from "../fixtures.ts";
import { ENTER_ORIGIN } from "../local-origins";

import { reviewCasesForFlow } from "../review-inventory";
import { startRuntime } from "../runtime.ts";
import { openReviewContext } from "./review-browser";

const CALLBACK_URL = `${ENTER_ORIGIN}/flow-example.html`;

// This integration issues one real key in a disposable local database.
// Run explicitly after scoped local credential-creation approval.
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
    }
});

test.runIf(process.env.FLOW_APP_AUTHORIZATION_TEST === "1")(
    "real Enter session, PKCE grant and SDK→Gen→Enter share the local account",
    async () => {
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

        const reset = await request("/__flow/reset", {});
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
            name: "FLOW_REVIEW_API_KEY",
            type: "secret",
            pollenBudget: 5,
            accountPermissions: ["profile", "usage"],
            metadata: {
                requestedClientId: CLIENT_ID,
                redirectUri: CALLBACK_URL,
            },
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
                headers: {
                    cookie,
                    authorization: `Bearer ${token.access_token}`,
                },
            }),
        );
        expect(keyWithEnterCookie.status).toBe(200);
        expect((await keyWithEnterCookie.json()).id).toBe(createdKey.id);
        expect(await sdk.accountBalance()).toEqual({
            balance: 5,
            accountBalance: { total: 10, tier: 0, paid: 10 },
        });
        const connected = await request("/__flow/state");
        expect((await connected.json()).connection.keyId).toBe(createdKey.id);

        await request("/__flow/conditions", { pollen: "quest" });
        expect((await sdk.accountBalance()).accountBalance).toEqual({
            total: 5,
            tier: 5,
            paid: 0,
        });
        await request("/__flow/conditions", { pollen: "empty" });
        expect((await sdk.accountBalance()).accountBalance?.total).toBe(0);
        await expect(
            sdk.text("Local preflight", { model: "openai" }),
        ).resolves.toContain("doesn't have enough credits");

        await request("/__flow/conditions", {
            pollen: "paid",
            allowance: "exhausted",
        });
        expect((await sdk.accountBalance()).balance).toBe(0);
        await expect(
            sdk.text("Local allowance preflight", { model: "openai" }),
        ).resolves.toContain("reached its budget");
        await request("/__flow/conditions", { account: "banned" });
        await expect(sdk.accountProfile()).rejects.toMatchObject({
            status: 403,
        });

        const signedOut = await request("/__flow/conditions", {
            account: "signed-out",
        });
        expect(signedOut.headers.get("set-cookie")?.includes("Max-Age=0")).toBe(
            true,
        );
        expect(
            await (await request("/api/auth/get-session")).json(),
        ).toBeNull();
        expect((await request("/api/account/profile")).status).toBe(401);
        await request("/__flow/conditions", { account: "signed-in" });
        expect((await request("/api/auth/sign-out", {})).status).toBe(200);
        expect(
            (await (await request("/__flow/state")).json()).conditions.account,
        ).toBe("signed-out");
        await request("/__flow/reset", {});
        await expect(sdk.accountProfile()).rejects.toMatchObject({
            status: 401,
        });
    },
    60000,
);

test.runIf(process.env.FLOW_CREDENTIAL_TEST === "1")(
    "SDK restores its session, edits allowance and refreshes on tab return",
    async () => {
        const recipe = reviewCasesForFlow("app", "main").find(
            (item) => item.id === "app-connected",
        );
        if (!recipe) throw new Error("Missing connected app situation");
        const browser = await chromium.launch({ headless: true });
        try {
            const { context, credentialRequests } = await openReviewContext(
                runtime,
                browser,
                recipe,
            );
            try {
                const page = await context.newPage();
                const origin = "http://localhost:4180";
                await page.goto(
                    `${origin}/flow-screen.html?${new URLSearchParams({ ...recipe.query, review_case: recipe.id, review_flow: "app", review_section: "main" })}`,
                );
                const menu = page.getByRole("button", {
                    name: "App account menu",
                    exact: true,
                });
                await menu.waitFor();
                await page.reload();
                await menu.waitFor();
                // Restoring tab storage must not restart OAuth or mint another key.
                expect(
                    credentialRequests.filter(
                        (path) => path === "/api/api-keys",
                    ),
                ).toHaveLength(1);
                expect(
                    credentialRequests.filter(
                        (path) => path === "/api/oauth/token",
                    ),
                ).toHaveLength(1);
                await page.evaluate(() =>
                    history.replaceState(
                        null,
                        "",
                        "/flow-example.html?room=abc#latest",
                    ),
                );
                await menu.click();
                const permissions = page.getByRole("link", {
                    name: "Permissions",
                    exact: true,
                });
                const destination = new URL(
                    (await permissions.getAttribute("href")) ?? "",
                    origin,
                );
                expect(destination.pathname).toBe("/edit-key");
                expect(destination.searchParams.get("redirect")).toBe(
                    `${origin}/flow-example.html?room=abc#latest`,
                );
                const popupReady = page.waitForEvent("popup");
                await permissions.click();
                const editor = await popupReady;
                await editor.locator('input[name="pollen-budget"]').fill("7");
                await editor
                    .getByRole("button", { name: "Save changes", exact: true })
                    .click();
                await editor
                    .getByText(
                        "Changes saved. They apply to future requests.",
                        { exact: true },
                    )
                    .waitFor();
                await editor.close();
                await page.bringToFront();
                const refreshed = page.waitForResponse(
                    (response) =>
                        new URL(response.url()).pathname === "/gen/account/key",
                );
                await page.evaluate(() =>
                    document.dispatchEvent(new Event("visibilitychange")),
                );
                expect((await refreshed).ok()).toBe(true);
                await menu.filter({ hasText: "7 pollen" }).waitFor();
                await menu.click();
                await page
                    .getByRole("button", { name: "Disconnect", exact: true })
                    .click();
                await page
                    .getByRole("button", {
                        name: "Pollinations Connect",
                        exact: true,
                    })
                    .waitFor();
                expect(
                    await page.evaluate(() =>
                        Object.keys(sessionStorage).some(
                            (key) =>
                                key.startsWith("polli:") &&
                                key.endsWith(":token"),
                        ),
                    ),
                ).toBe(false);
                await page.reload();
                await page
                    .getByRole("button", {
                        name: "Pollinations Connect",
                        exact: true,
                    })
                    .waitFor();
                expect(
                    credentialRequests.filter(
                        (path) => path === "/api/api-keys",
                    ),
                ).toHaveLength(1);
            } finally {
                await context.close();
            }
        } finally {
            await browser.close();
        }
    },
    60000,
);
