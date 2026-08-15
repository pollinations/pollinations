import { createExecutionContext, env } from "cloudflare:test";
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

async function runTokenFor(parentApiKeyId: string, managedAgentId?: string) {
    return signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId,
        managedAgentId,
        runId: crypto.randomUUID(),
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

test("agent run tokens cannot recurse into community models", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 100 } });
    const token = await runTokenFor(parent.id);

    const response = await probe(
        communityProbe,
        "https://gen.pollinations.ai/",
        token,
    );
    expect(response.status).toBe(403);
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
    expect(await response.json()).toMatchObject({
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
    const token = await runTokenFor(parent.id);
    const probed = (await (
        await probe(authProbe, "https://gen.pollinations.ai/", token)
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

test("rejects tampered, expired and malformed agent run tokens", async () => {
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: "parent-key-id",
        runId: "run-id",
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
            runId: "run-id",
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
});
