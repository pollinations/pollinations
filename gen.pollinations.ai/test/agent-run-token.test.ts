import { createExecutionContext, env, SELF } from "cloudflare:test";
import {
    AGENT_RUN_TOKEN_TTL_SECONDS,
    signAgentRunToken,
    verifyAgentRunToken,
} from "@shared/auth/agent-run-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { apikey as apiKeyTable } from "@shared/db/better-auth.ts";
import {
    createTestApiKey,
    RESTRICTED_IMAGE_TEST_MODEL,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { SignJWT } from "jose";
import { expect } from "vitest";
import { type AuthEnv, auth } from "@/middleware/auth.ts";

type MintResponse = {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    run_id: string;
    agent_id: string;
    models?: string[];
};

const authProbe = new Hono<AuthEnv>().use("*", auth()).get("/", (c) =>
    c.json({
        userId: c.var.auth.user?.id ?? null,
        apiKeyId: c.var.auth.apiKey?.id ?? null,
        pollenBalance: c.var.auth.apiKey?.pollenBalance ?? null,
        permissions: c.var.auth.apiKey?.permissions ?? null,
        rawKey: c.var.auth.apiKey?.rawKey ?? null,
        agentRun: c.var.auth.agentRun ?? null,
    }),
);

const communityProbe = new Hono<AuthEnv>()
    .use("*", auth())
    .use("*", async (c, next) => {
        c.set("model", {
            requested: "Itachi-1824/polli",
            resolved: "Itachi-1824/polli",
            communityEndpoint: {
                modelId: "Itachi-1824/polli",
            } as CommunityEndpointRuntime,
        });
        await next();
    })
    .get("/", (c) => {
        c.var.auth.requireModelAccess();
        return c.text("ok");
    });

async function mintAgentRunToken(parentKey: string, models?: string[]) {
    return SELF.fetch(
        new Request("https://gen.pollinations.ai/v1/agent/run-token", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${parentKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                agent_id: "example-agent",
                ...(models && { models }),
                expires_in: 300,
            }),
        }),
    );
}

async function probeAgentRunToken(token: string) {
    const executionContext = createExecutionContext();
    return authProbe.fetch(
        new Request("https://gen.pollinations.ai/", {
            headers: { Authorization: `Bearer ${token}` },
        }),
        env,
        executionContext,
    );
}

test("mints a scoped token that resolves to the parent key for billing", async () => {
    const parent = await createTestApiKey({
        allowedModels: [
            RESTRICTED_TEXT_TEST_MODEL,
            RESTRICTED_IMAGE_TEST_MODEL,
        ],
        pollenBudget: 42,
        user: { tierBalance: 100 },
    });

    const response = await mintAgentRunToken(parent.key, [
        RESTRICTED_TEXT_TEST_MODEL,
        RESTRICTED_IMAGE_TEST_MODEL,
    ]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const minted = (await response.json()) as MintResponse;
    expect(minted.access_token).toMatch(/^ag_/);
    expect(minted.access_token).not.toContain(parent.key);
    expect(minted).toMatchObject({
        token_type: "Bearer",
        expires_in: 300,
        agent_id: "example-agent",
        models: [RESTRICTED_TEXT_TEST_MODEL, RESTRICTED_IMAGE_TEST_MODEL],
    });

    const probeResponse = await probeAgentRunToken(minted.access_token);
    expect(probeResponse.status).toBe(200);
    expect(await probeResponse.json()).toEqual({
        userId: parent.userId,
        apiKeyId: parent.id,
        pollenBalance: 42,
        permissions: {
            models: [RESTRICTED_TEXT_TEST_MODEL, RESTRICTED_IMAGE_TEST_MODEL],
        },
        rawKey: minted.access_token,
        agentRun: {
            agentId: "example-agent",
            runId: minted.run_id,
            expiresAt: expect.any(Number),
        },
    });
});

test("an unscoped token inherits the parent model allowlist", async () => {
    const parent = await createTestApiKey({
        allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
        user: { tierBalance: 100 },
    });
    const mintResponse = await mintAgentRunToken(parent.key);
    const minted = (await mintResponse.json()) as MintResponse;

    expect(minted.models).toBeUndefined();
    const probeResponse = await probeAgentRunToken(minted.access_token);
    expect(await probeResponse.json()).toMatchObject({
        permissions: { models: [RESTRICTED_TEXT_TEST_MODEL] },
    });
});

test("agent run tokens cannot recurse into community models", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const mintResponse = await mintAgentRunToken(parent.key);
    const minted = (await mintResponse.json()) as MintResponse;

    const response = await communityProbe.fetch(
        new Request("https://gen.pollinations.ai/", {
            headers: { Authorization: `Bearer ${minted.access_token}` },
        }),
        env,
        createExecutionContext(),
    );
    expect(response.status).toBe(403);
});

test("agent run token narrows the visible model catalog", async () => {
    const parent = await createTestApiKey({
        user: { tierBalance: 100 },
    });
    const mintResponse = await mintAgentRunToken(parent.key, [
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
    const minted = (await mintResponse.json()) as MintResponse;

    const modelsResponse = await SELF.fetch(
        new Request("https://gen.pollinations.ai/v1/models", {
            headers: { Authorization: `Bearer ${minted.access_token}` },
        }),
    );
    expect(modelsResponse.status).toBe(200);
    const models = (await modelsResponse.json()) as {
        data: { id: string }[];
    };
    expect(models.data.map((model) => model.id)).toEqual([
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
});

test("cannot mint broader or nested agent run tokens", async () => {
    const parent = await createTestApiKey({
        allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
        user: { tierBalance: 100 },
    });

    const broaderResponse = await mintAgentRunToken(parent.key, [
        RESTRICTED_IMAGE_TEST_MODEL,
    ]);
    expect(broaderResponse.status).toBe(403);

    const mintResponse = await mintAgentRunToken(parent.key, [
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
    const minted = (await mintResponse.json()) as MintResponse;
    const nestedResponse = await mintAgentRunToken(minted.access_token, [
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
    expect(nestedResponse.status).toBe(403);
});

test("parent key revocation immediately invalidates an agent run token", async () => {
    const parent = await createTestApiKey({
        allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
        user: { tierBalance: 100 },
    });
    const mintResponse = await mintAgentRunToken(parent.key, [
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
    const minted = (await mintResponse.json()) as MintResponse;

    await drizzle(env.DB)
        .update(apiKeyTable)
        .set({ enabled: false })
        .where(eq(apiKeyTable.id, parent.id));

    const probeResponse = await probeAgentRunToken(minted.access_token);
    expect(await probeResponse.json()).toMatchObject({
        userId: null,
        apiKeyId: null,
    });
});

test("spends the parent key's budget and the parent user's wallet", async () => {
    // The design claim this file exists to prove: billing never learns run
    // tokens exist. Resolving one has to move the same two balances a request
    // with the parent key itself would have moved.
    const parent = await createTestApiKey({
        pollenBudget: 5,
        user: { tierBalance: 2 },
    });
    const mintResponse = await mintAgentRunToken(parent.key);
    const minted = (await mintResponse.json()) as MintResponse;

    const probed = (await (
        await probeAgentRunToken(minted.access_token)
    ).json()) as {
        userId: string;
        apiKeyId: string;
        pollenBalance: number;
    };

    const db = drizzle(env.DB);
    await handleBalanceDeduction({
        db,
        isBilledUsage: true,
        totalPrice: 1,
        userId: probed.userId,
        apiKeyId: probed.apiKeyId,
        apiKeyPollenBalance: probed.pollenBalance,
    });

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

test("rejects tampered and expired agent run tokens", async () => {
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: "parent-key-id",
        agentId: "example-agent",
        runId: "run-id",
        models: [RESTRICTED_TEXT_TEST_MODEL],
        expiresIn: 30,
        now: 1_000,
    });
    const parts = token.slice(3).split(".");
    parts[2] = `${parts[2].startsWith("a") ? "b" : "a"}${parts[2].slice(1)}`;
    const tampered = `ag_${parts.join(".")}`;

    await expect(
        verifyAgentRunToken(tampered, env.BETTER_AUTH_SECRET, 1_001),
    ).rejects.toThrow();
    await expect(
        verifyAgentRunToken(token, env.BETTER_AUTH_SECRET, 1_036),
    ).rejects.toThrow();
    await expect(
        signAgentRunToken({
            secret: env.BETTER_AUTH_SECRET,
            parentApiKeyId: "parent-key-id",
            agentId: "example-agent",
            runId: "run-id",
            expiresIn: AGENT_RUN_TOKEN_TTL_SECONDS + 1,
        }),
    ).rejects.toThrow("Invalid agent run token lifetime");

    const overlongJwt = await new SignJWT({
        version: 1,
        agent: "example-agent",
    })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer("gen.pollinations.ai")
        .setAudience("pollinations-api")
        .setSubject("parent-key-id")
        .setJti("run-id")
        .setIssuedAt(1_000)
        .setExpirationTime(1_000 + AGENT_RUN_TOKEN_TTL_SECONDS + 1)
        .sign(
            new TextEncoder().encode(
                `pollinations-agent-run-token:v1\0${env.BETTER_AUTH_SECRET}`,
            ),
        );
    await expect(
        verifyAgentRunToken(`ag_${overlongJwt}`, env.BETTER_AUTH_SECRET, 1_001),
    ).rejects.toThrow("Invalid agent run token claims");
});
