import { createExecutionContext, env } from "cloudflare:test";
import {
    AGENT_RUN_TOKEN_TTL_SECONDS,
    signAgentRunToken,
    verifyAgentRunToken,
} from "@shared/auth/agent-run-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { apikey as apiKeyTable } from "@shared/db/better-auth.ts";
import {
    createTestApiKey,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { expect } from "vitest";
import { type AuthEnv, auth } from "@/middleware/auth.ts";

const authProbe = new Hono<AuthEnv>().use("*", auth()).get("/", (c) =>
    c.json({
        userId: c.var.auth.user?.id ?? null,
        apiKeyId: c.var.auth.apiKey?.id ?? null,
        pollenBalance: c.var.auth.apiKey?.pollenBalance ?? null,
        permissions: c.var.auth.apiKey?.permissions ?? null,
        agentRun: c.var.auth.agentRun ?? null,
    }),
);

function communityProbe(type: CommunityEndpointRuntime["type"] = "proxy") {
    return new Hono<AuthEnv>()
        .use("*", auth())
        .use("*", async (c, next) => {
            c.set("model", {
                requested: "Itachi-1824/polli",
                resolved: "Itachi-1824/polli",
                communityEndpoint: {
                    id: "managed-agent-id",
                    modelId: "Itachi-1824/polli",
                    type,
                } as unknown as CommunityEndpointRuntime,
            });
            await next();
        })
        .get("/", (c) => {
            c.var.auth.requireModelAccess();
            return c.text("ok");
        });
}

async function runTokenFor(parentApiKeyId: string, managedAgentId?: string) {
    return signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId,
        parentRequestId: crypto.randomUUID(),
        managedAgentId,
    });
}

async function probe(app: Hono<AuthEnv>, url: string, token?: string) {
    return app.fetch(
        new Request(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        env,
        createExecutionContext(),
    );
}

test("resolves to the parent key, without its account scope", async () => {
    const parent = await createTestApiKey({
        allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
        pollenBudget: 42,
        user: { tierBalance: 100 },
    });
    const token = await runTokenFor(parent.id);
    expect(token).toMatch(/^ag_/);
    expect(token).not.toContain(parent.key);

    const response = await probe(
        authProbe,
        "https://gen.pollinations.ai/",
        token,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        userId: parent.userId,
        apiKeyId: parent.id,
        pollenBalance: 42,
        // Model access is inherited; every other scope the parent may hold is
        // dropped, so the token cannot manage the owner's account.
        permissions: { models: [RESTRICTED_TEXT_TEST_MODEL] },
        agentRun: { parentApiKeyId: parent.id },
    });
});

test("preserves the managed agent scope", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const token = await runTokenFor(parent.id, "managed-agent-id");

    const response = await probe(
        authProbe,
        "https://gen.pollinations.ai/",
        token,
    );
    expect(await response.json()).toMatchObject({
        agentRun: {
            parentApiKeyId: parent.id,
            managedAgentId: "managed-agent-id",
        },
    });
});

test("surfaces the parent request id", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });

    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: parent.id,
        parentRequestId: "req-abc",
    });
    const body = await (
        await probe(authProbe, "https://gen.pollinations.ai/", token)
    ).json();
    expect(body).toMatchObject({ agentRun: { parentRequestId: "req-abc" } });
});

test("agent run tokens can call community models and agents", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const token = await runTokenFor(parent.id);

    const communityResponse = await probe(
        communityProbe(),
        "https://gen.pollinations.ai/",
        token,
    );
    expect(communityResponse.status).toBe(200);

    const agentResponse = await probe(
        communityProbe("prompt_agent"),
        "https://gen.pollinations.ai/",
        token,
    );
    expect(agentResponse.status).toBe(200);

    const delegatedAgentResponse = await probe(
        communityProbe("endpoint_agent"),
        "https://gen.pollinations.ai/",
        token,
    );
    expect(delegatedAgentResponse.status).toBe(200);
});

test("is rejected as a query parameter", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const token = await runTokenFor(parent.id);

    // Spend credentials must not land in access logs or browser history.
    const response = await probe(
        authProbe,
        `https://gen.pollinations.ai/?key=${token}`,
    );
    expect(await response.json()).toMatchObject({
        userId: null,
        apiKeyId: null,
    });
});

test("parent key revocation immediately invalidates an agent run token", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const token = await runTokenFor(parent.id);

    await drizzle(env.DB)
        .update(apiKeyTable)
        .set({ enabled: false })
        .where(eq(apiKeyTable.id, parent.id));

    const response = await probe(
        authProbe,
        "https://gen.pollinations.ai/",
        token,
    );
    expect(response.status).toBe(401);
});

test("spends the parent key's budget and the parent user's wallet", async () => {
    // Enter resolves the delegated token to its parent key and must move the
    // same two balances a request with that parent key would have moved.
    const parent = await createTestApiKey({
        pollenBudget: 5,
        user: { tierBalance: 2 },
    });
    const token = await runTokenFor(parent.id);
    const requestId = crypto.randomUUID();

    const authorized = await env.ENTER_BILLING.authorize(token, {
        producer: "gen.pollinations.ai",
        requestId,
        estimatedPrice: 1,
        paidOnly: false,
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) return;
    expect(authorized.identity.userId).toBe(parent.userId);
    expect(authorized.identity.apiKey.id).toBe(parent.id);

    const settled = await env.ENTER_BILLING.settle(authorized.grant.id, [
        {
            id: "usage",
            requestId,
            meter: "generate.text",
            price: 1,
            paidOnly: false,
            occurredAt: Date.now(),
            telemetry: { eventType: "generate.text" },
        },
    ]);
    expect(settled.ok).toBe(true);

    const db = drizzle(env.DB);
    expect((await getUserBalance(db, parent.userId)).tierBalance).toBeCloseTo(
        1,
        10,
    );
    const row = await db
        .select({ pollenBalance: apiKeyTable.pollenBalance })
        .from(apiKeyTable)
        .where(eq(apiKeyTable.id, parent.id))
        .get();
    expect(row?.pollenBalance).toBeCloseTo(4, 10);
});

test("rejects tampered, expired and malformed agent run tokens", async () => {
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: "parent-key-id",
        parentRequestId: "parent-request-id",
        expiresIn: 30,
        now: 1_000,
    });
    const parts = token.slice(3).split(".");
    parts[2] = `${parts[2].startsWith("a") ? "b" : "a"}${parts[2].slice(1)}`;

    await expect(
        verifyAgentRunToken(
            `ag_${parts.join(".")}`,
            env.BETTER_AUTH_SECRET,
            1_001,
        ),
    ).rejects.toThrow();
    await expect(
        verifyAgentRunToken(token, env.BETTER_AUTH_SECRET, 1_036),
    ).rejects.toThrow();
    await expect(
        signAgentRunToken({
            secret: env.BETTER_AUTH_SECRET,
            parentApiKeyId: "parent-key-id",
            parentRequestId: "parent-request-id",
            expiresIn: AGENT_RUN_TOKEN_TTL_SECONDS + 1,
        }),
    ).rejects.toThrow("Invalid agent run token lifetime");
    // Correctly signed but missing the subject: the signature proves origin, it
    // does not prove the payload has the shape the auth layer reads.
    const malformedJwt = await new SignJWT({ version: 1 })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer("gen.pollinations.ai")
        .setAudience("pollinations-api")
        .setJti("run-id")
        .setIssuedAt(1_000)
        .setExpirationTime(1_000 + AGENT_RUN_TOKEN_TTL_SECONDS)
        .sign(
            new TextEncoder().encode(
                `pollinations-agent-run-token:v1\0${env.BETTER_AUTH_SECRET}`,
            ),
        );
    await expect(
        verifyAgentRunToken(
            `ag_${malformedJwt}`,
            env.BETTER_AUTH_SECRET,
            1_001,
        ),
    ).rejects.toThrow("Invalid agent run token claims");

    // The parent request id is what groups a run's generations, so a token
    // that cannot be attributed is rejected rather than billed untagged.
    for (const payload of [
        { version: 1 },
        { version: 1, parentRequestId: "" },
    ]) {
        const untagged = await new SignJWT(payload)
            .setProtectedHeader({ alg: "HS256", typ: "JWT" })
            .setIssuer("gen.pollinations.ai")
            .setAudience("pollinations-api")
            .setSubject("parent-key-id")
            .setJti("run-id")
            .setIssuedAt(1_000)
            .setExpirationTime(1_000 + AGENT_RUN_TOKEN_TTL_SECONDS)
            .sign(
                new TextEncoder().encode(
                    `pollinations-agent-run-token:v1\0${env.BETTER_AUTH_SECRET}`,
                ),
            );
        await expect(
            verifyAgentRunToken(
                `ag_${untagged}`,
                env.BETTER_AUTH_SECRET,
                1_001,
            ),
        ).rejects.toThrow("Invalid agent run token claims");
    }
});
