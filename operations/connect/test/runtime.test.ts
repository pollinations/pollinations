import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Pollinations } from "../../../packages/sdk/src/client.ts";
import { CALLBACK_URL, CLIENT_ID, USER_ID } from "../fixtures.ts";
import type { ReviewCase } from "../review-cases.ts";
import { prepareReviewCase } from "../review-prepare.ts";
import { startRuntime } from "../runtime.ts";

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
        "pollinations-agent",
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
