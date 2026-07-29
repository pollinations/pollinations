import { env } from "cloudflare:test";
import {
    type ApiKeyAuthBindings,
    authenticateApiKeyRequest,
} from "@shared/auth/api-key.ts";
import {
    intersectModels,
    mintRunToken,
    RUN_TOKEN_AUDIENCE,
    signRunToken,
    verifyRunToken,
} from "@shared/auth/run-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { apikey as apikeyTable } from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { createTestApiKey } from "@shared/test/fixtures/api-keys.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { communityEndpointGatewayContext } from "@/text/communityEndpoint.ts";

const SECRET = "test-run-token-secret";
const db = drizzle(env.DB);

const authEnv: ApiKeyAuthBindings = {
    DB: env.DB,
    RUN_TOKEN_SECRET: SECRET,
};

const ENCRYPTION_SECRET = "test-encryption-secret";

async function communityEndpointFixture(): Promise<CommunityEndpointRuntime> {
    return {
        id: "ce-1",
        ownerUserId: "owner-1",
        modelId: "community/agent",
        name: "agent",
        description: null,
        baseUrl: "https://agent.example",
        upstreamModel: "polli",
        bearerTokenCiphertext: await encryptSecret(
            "endpoint-access-token",
            ENCRYPTION_SECRET,
        ),
        visibility: "public",
        disabledAt: null,
        disabledReason: null,
    } as CommunityEndpointRuntime;
}

function requestWith(token: string): Request {
    return new Request("https://gen.pollinations.ai/text/hi", {
        headers: { Authorization: `Bearer ${token}` },
    });
}

describe("run token signing", () => {
    it("round-trips a signed payload", async () => {
        const token = await mintRunToken(
            {
                userId: "user-1",
                apiKeyId: "key-1",
                runId: "run-1",
                agentId: "polli-agent",
            },
            SECRET,
        );

        expect(token.startsWith("ag_")).toBe(true);

        const payload = await verifyRunToken(token, SECRET);
        expect(payload).toMatchObject({
            sub: "user-1",
            pk: "key-1",
            run: "run-1",
            agent: "polli-agent",
            aud: RUN_TOKEN_AUDIENCE,
        });
    });

    it("expires thirty minutes after minting", async () => {
        const now = 1_700_000_000_000;
        const token = await mintRunToken(
            {
                userId: "user-1",
                apiKeyId: "key-1",
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
            now,
        );

        const payload = await verifyRunToken(token, SECRET, now);
        expect(payload?.exp).toBe(Math.floor(now / 1000) + 1800);
        expect(await verifyRunToken(token, SECRET, now + 1_799_000)).not.toBe(
            null,
        );
        expect(await verifyRunToken(token, SECRET, now + 1_801_000)).toBe(null);
    });

    it("rejects a tampered payload", async () => {
        const token = await mintRunToken(
            {
                userId: "user-1",
                apiKeyId: "key-1",
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
        );
        const [body, signature] = token.slice(3).split(".");
        const forged = btoa(
            JSON.stringify({
                sub: "user-2",
                pk: "key-2",
                run: "r",
                agent: "a",
                aud: RUN_TOKEN_AUDIENCE,
                exp: 9_999_999_999,
            }),
        )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        expect(body).not.toBe(forged);
        expect(await verifyRunToken(`ag_${forged}.${signature}`, SECRET)).toBe(
            null,
        );
    });

    it("rejects a token signed with another secret", async () => {
        const token = await mintRunToken(
            {
                userId: "user-1",
                apiKeyId: "key-1",
                runId: "run-1",
                agentId: "a",
            },
            "other-secret",
        );
        expect(await verifyRunToken(token, SECRET)).toBe(null);
    });

    it("rejects a hand-signed token that outlives the ttl policy", async () => {
        const now = 1_700_000_000_000;
        const token = await signRunToken(
            {
                sub: "user-1",
                pk: "key-1",
                run: "run-1",
                agent: "a",
                aud: RUN_TOKEN_AUDIENCE,
                exp: Math.floor(now / 1000) + 86_400,
            },
            SECRET,
        );
        expect(await verifyRunToken(token, SECRET, now)).toBe(null);
    });

    it("rejects a token addressed to another audience", async () => {
        const token = await signRunToken(
            {
                sub: "user-1",
                pk: "key-1",
                run: "run-1",
                agent: "a",
                aud: "enter",
                exp: Math.floor(Date.now() / 1000) + 600,
            },
            SECRET,
        );
        expect(await verifyRunToken(token, SECRET)).toBe(null);
    });
});

describe("intersectModels", () => {
    it("treats undefined as unrestricted", () => {
        expect(intersectModels(undefined, ["flux"])).toEqual(["flux"]);
        expect(intersectModels(["flux"], undefined)).toEqual(["flux"]);
        expect(intersectModels(undefined, undefined)).toBe(undefined);
    });

    it("narrows to the overlap and never widens", () => {
        expect(intersectModels(["flux", "openai"], ["openai", "veo"])).toEqual([
            "openai",
        ]);
        expect(intersectModels(["flux"], ["veo"])).toEqual([]);
    });
});

describe("run token authentication", () => {
    it("resolves to the parent key identity so billing is unchanged", async () => {
        const parent = await createTestApiKey({ pollenBudget: 5 });
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-abc",
                agentId: "polli-agent",
            },
            SECRET,
        );

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: authEnv,
        });

        expect(result?.user?.id).toBe(parent.userId);
        expect(result?.apiKey.id).toBe(parent.id);
        expect(result?.apiKey.pollenBalance).toBe(5);
        expect(result?.apiKey.metadata).toMatchObject({
            runId: "run-abc",
            agentId: "polli-agent",
        });
    });

    it("drops account permissions the parent key holds", async () => {
        const parent = await createTestApiKey({
            accountPermissions: ["keys", "profile"],
        });
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
        );

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: authEnv,
        });

        expect(result?.apiKey.permissions?.account).toBe(undefined);
    });

    it("cannot widen the parent key's model allowlist", async () => {
        const parent = await createTestApiKey({ allowedModels: ["flux"] });
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-1",
                agentId: "a",
                models: ["flux", "veo"],
            },
            SECRET,
        );

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: authEnv,
        });

        expect(result?.apiKey.permissions?.models).toEqual(["flux"]);
    });

    it("dies with the parent key", async () => {
        const parent = await createTestApiKey();
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
        );

        await db
            .delete(apikeyTable)
            .where(sql`${apikeyTable.id} = ${parent.id}`);

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: authEnv,
        });

        expect(result).toBe(null);
    });

    it("spends the parent key's budget and the parent user's wallet", async () => {
        const parent = await createTestApiKey({
            pollenBudget: 5,
            user: { tierBalance: 2 },
        });
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
        );

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: authEnv,
        });

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 1,
            userId: result?.user?.id,
            apiKeyId: result?.apiKey.id,
            apiKeyPollenBalance: result?.apiKey.pollenBalance,
        });

        expect(
            (await getUserBalance(db, parent.userId)).tierBalance,
        ).toBeCloseTo(1, 10);
        const [row] = await db
            .select({ pollenBalance: apikeyTable.pollenBalance })
            .from(apikeyTable)
            .where(sql`${apikeyTable.id} = ${parent.id}`);
        expect(row.pollenBalance).toBeCloseTo(4, 10);
    });

    it("hands a community endpoint a run token, not the caller's key", async () => {
        const parent = await createTestApiKey();
        const context = await communityEndpointGatewayContext(
            await communityEndpointFixture(),
            { name: "polli" } as never,
            { messages: [] } as never,
            ENCRYPTION_SECRET,
            "https://portkey.example",
            "sk_caller-real-key",
            {
                user: { id: parent.userId } as never,
                apiKey: { id: parent.id } as never,
            },
            SECRET,
        );

        const config = context.modelConfig as Record<string, never>;
        const forwarded = config.forwardHeaders as unknown as Record<
            string,
            string
        >;
        const token = forwarded["X-Pollinations-Key"];

        expect(token.startsWith("ag_")).toBe(true);
        expect(JSON.stringify(forwarded)).not.toContain("sk_caller-real-key");
        const payload = await verifyRunToken(token, SECRET);
        expect(payload?.sub).toBe(parent.userId);
        expect(payload?.pk).toBe(parent.id);
        expect(payload?.agent).toBe("community/agent");
    });

    it("forwards an existing run token instead of extending the deadline", async () => {
        const inbound = "ag_already-running";
        const context = await communityEndpointGatewayContext(
            await communityEndpointFixture(),
            { name: "polli" } as never,
            { messages: [] } as never,
            ENCRYPTION_SECRET,
            "https://portkey.example",
            inbound,
            {
                user: { id: "user-1" } as never,
                apiKey: {
                    id: "key-1",
                    rawKey: inbound,
                    metadata: { runId: "run-1" },
                } as never,
            },
            SECRET,
        );

        const config = context.modelConfig as Record<string, never>;
        const forwarded = config.forwardHeaders as unknown as Record<
            string,
            string
        >;
        expect(forwarded["X-Pollinations-Key"]).toBe(inbound);
    });

    it("sends no spend credential when delegation is not possible", async () => {
        const context = await communityEndpointGatewayContext(
            await communityEndpointFixture(),
            { name: "polli" } as never,
            { messages: [] } as never,
            ENCRYPTION_SECRET,
            "https://portkey.example",
            "sk_caller-real-key",
            {
                user: { id: "user-1" } as never,
                apiKey: { id: "key-1" } as never,
            },
            undefined,
        );

        const config = context.modelConfig as Record<string, never>;
        expect(config.forwardHeaders).toBe(undefined);
    });

    it("is rejected when the worker has no run token secret", async () => {
        const parent = await createTestApiKey();
        const token = await mintRunToken(
            {
                userId: parent.userId,
                apiKeyId: parent.id,
                runId: "run-1",
                agentId: "a",
            },
            SECRET,
        );

        const result = await authenticateApiKeyRequest({
            request: requestWith(token),
            env: { DB: env.DB },
        });

        expect(result).toBe(null);
    });
});
