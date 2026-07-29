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
import { apikey as apikeyTable } from "@shared/db/better-auth.ts";
import { createTestApiKey } from "@shared/test/fixtures/api-keys.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const SECRET = "test-run-token-secret";
const db = drizzle(env.DB);

const authEnv: ApiKeyAuthBindings = {
    DB: env.DB,
    RUN_TOKEN_SECRET: SECRET,
};

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
