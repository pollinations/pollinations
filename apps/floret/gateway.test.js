import assert from "node:assert/strict";
import test from "node:test";
import {
    signAgentRunToken,
    verifyAgentRunToken,
} from "../../shared/auth/agent-run-token.ts";
import { catalogOutbound, createGateway } from "./gateway.js";

const allToken = await signAgentRunToken({
    secret: "local-gateway-test-secret",
    parentApiKeyId: "parent",
    parentRequestId: "request",
});

function setup() {
    const calls = { agent: 0, review: [], auth: 0, refresh: 0 };
    const snapshot = {
        version: "1",
        catalog: [{ name: "image" }],
        review: { revision: "1" },
    };
    const authority = {
        snapshot: async () => snapshot,
        refresh: async () => {
            calls.refresh++;
        },
        review: async (key) => {
            calls.review.push(key);
        },
    };
    const env = {
        FLORET_CATALOG: {
            getByName(name) {
                assert.equal(name, "global");
                return authority;
            },
        },
    };
    const pending = [];
    const ctx = {
        waitUntil(task) {
            pending.push(task);
        },
    };
    const gateway = createGateway(
        () => ({
            fetch: async () => {
                calls.agent++;
                return new Response("result");
            },
        }),
        async (url, options) => {
            calls.auth++;
            assert.equal(url, "https://enter.pollinations.ai/api/account/key");
            assert.equal(options.redirect, "manual");
            await verifyAgentRunToken(
                options.headers.Authorization.slice(7),
                "local-gateway-test-secret",
            );
            return Response.json({ valid: true });
        },
    );
    return { calls, env, ctx, gateway, pending, snapshot };
}

test("text requests never allocate a shell or charge callers for catalog maintenance", async () => {
    const { calls, env, ctx, gateway, pending } = setup();
    const response = await gateway(
        new Request("https://floret.test/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${allToken}` },
            body: "private prompt",
        }),
        env,
        ctx,
    );
    assert.equal(await response.text(), "result");
    await Promise.all(pending);
    assert.deepEqual(calls, { agent: 1, review: [], auth: 1, refresh: 0 });
    assert.equal(env.FLORET_SHELL, undefined);
});

test("invalid credentials and private paths never reach agent", async () => {
    const { calls, env, ctx, gateway } = setup();
    const unauthenticated = await gateway(
        new Request("https://floret.test/v1/chat/completions", {
            method: "POST",
        }),
        env,
        ctx,
    );
    assert.equal(unauthenticated.status, 401);
    for (const path of ["/_internal/catalog", "/run"]) {
        assert.equal(
            (
                await gateway(
                    new Request(`https://floret.test${path}`, {
                        method: "POST",
                    }),
                    env,
                    ctx,
                )
            ).status,
            404,
        );
    }
    assert.equal(calls.agent, 0);
    assert.equal(calls.auth, 0);
});

test("read requests preserve current service and do not review catalog", async () => {
    const { calls, env, ctx, gateway, pending } = setup();
    assert.equal(
        (await gateway(new Request("https://floret.test/health"), env, ctx))
            .status,
        200,
    );
    assert.equal(calls.agent, 1);
    assert.equal(calls.auth, 0);
    assert.equal(pending.length, 0);
});

test("verified Quest runs cannot widen the policy forwarded to Floret", async () => {
    const secret = "local-gateway-test-secret";
    const bearer = await signAgentRunToken({
        secret,
        parentApiKeyId: "parent",
        parentRequestId: "request",
        pollen: "quest",
    });
    const seen = [];
    const gateway = createGateway(
        () => ({
            fetch: async (request) => {
                seen.push(await request.json());
                assert.equal(
                    request.headers.get("Authorization"),
                    `Bearer ${bearer}`,
                );
                return new Response("ok");
            },
        }),
        async (_url, options) => {
            const claims = await verifyAgentRunToken(
                options.headers.Authorization.slice(7),
                secret,
            );
            assert.equal(claims.pollen, "quest");
            return Response.json({ valid: true });
        },
    );
    for (const pollen of [undefined, "all", "quest"]) {
        const body = {
            model: "floret",
            messages: [],
            stream: true,
            ...(pollen ? { pollen } : {}),
        };
        const response = await gateway(
            new Request("https://floret.test/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${bearer}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            }),
            {},
        );
        assert.equal(response.status, 200);
        assert.deepEqual(seen.at(-1), { ...body, pollen: "quest" });
    }
});

test("an unverified Quest claim never reaches Floret", async () => {
    const bearer = await signAgentRunToken({
        secret: "untrusted-gateway-test-secret",
        parentApiKeyId: "parent",
        parentRequestId: "request",
        pollen: "quest",
    });
    const gateway = createGateway(
        () => ({ fetch: () => assert.fail("Invalid token reached Floret") }),
        async () => Response.json({ valid: false }),
    );
    const response = await gateway(
        new Request("https://floret.test/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${bearer}` },
            body: JSON.stringify({
                model: "floret",
                pollen: "all",
                messages: [],
            }),
        }),
        {},
    );
    assert.equal(response.status, 401);
});

test("private snapshot strips storage internals and credentials", async () => {
    const { env, snapshot } = setup();
    const response = await catalogOutbound(
        new Request("http://floret-catalog.internal/snapshot"),
        env,
    );
    assert.deepEqual(await response.json(), snapshot);
    assert.equal(
        (
            await catalogOutbound(
                new Request("http://floret-catalog.internal/snapshot", {
                    method: "POST",
                }),
                env,
            )
        ).status,
        404,
    );
});
