import { env, SELF } from "cloudflare:test";
import { COMMUNITY_MODEL_ALLOWED_GITHUB_IDS } from "@shared/auth/github-id-list.ts";
import * as schema from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "https://enter.pollinations.ai";

async function insertCommunityEndpointOwner(githubUsername: string) {
    const db = drizzle(env.DB, { schema });
    const id = `user-${crypto.randomUUID()}`;
    await db.insert(schema.user).values({
        id,
        name: githubUsername,
        email: `${githubUsername}@example.test`,
        githubId: COMMUNITY_MODEL_ALLOWED_GITHUB_IDS[0],
        githubUsername,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return id;
}

async function insertCommunityEndpoint(
    ownerUserId: string,
    overrides: Partial<typeof schema.communityEndpoint.$inferInsert> = {},
) {
    const db = drizzle(env.DB, { schema });
    const id = `endpoint-${crypto.randomUUID()}`;
    await db.insert(schema.communityEndpoint).values({
        id,
        ownerUserId,
        name: `model-${crypto.randomUUID().slice(0, 8)}`,
        baseUrl: "https://api.example.com/v1",
        upstreamModel: "gpt-4.1-mini",
        bearerTokenCiphertext: await encryptSecret(
            "sk_saved_token",
            env.BETTER_AUTH_SECRET,
        ),
        promptTextPrice: 0.1,
        completionTextPrice: 0.1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    });
    return id;
}

async function signedSessionCookie(userId: string): Promise<string> {
    const db = drizzle(env.DB, { schema });
    const token = `session-${crypto.randomUUID()}`;
    await db.insert(schema.session).values({
        id: `session-${crypto.randomUUID()}`,
        token,
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.BETTER_AUTH_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(token),
    );
    const encodedSignature = btoa(
        String.fromCharCode(...new Uint8Array(signature)),
    );
    return `better-auth.session_token=${encodeURIComponent(`${token}.${encodedSignature}`)}`;
}

describe("Community endpoint admin routes", () => {
    test("rejects deactivate/reactivate/list without a token", async () => {
        const listRes = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints`,
        );
        expect(listRes.status).toBe(401);

        const deactivateRes = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints/any-id/deactivate`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "test" }),
            },
        );
        expect(deactivateRes.status).toBe(401);
    });

    test("rejects the community monitor token on unrelated admin paths", async () => {
        const response = await SELF.fetch(`${BASE}/api/admin/update-tier`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.COMMUNITY_MONITOR_TOKEN}`,
            },
            body: JSON.stringify({ userId: "test", tier: "seed" }),
        });
        expect(response.status).toBe(401);
    });

    test("deactivates a community endpoint with the monitor token and sets a reason", async () => {
        const ownerUserId = await insertCommunityEndpointOwner(
            `owner-${crypto.randomUUID().slice(0, 8)}`,
        );
        const endpointId = await insertCommunityEndpoint(ownerUserId);

        const response = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints/${endpointId}/deactivate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.COMMUNITY_MONITOR_TOKEN}`,
                },
                body: JSON.stringify({ reason: "repeated timeouts" }),
            },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            id: string;
            disabledAt: string | null;
            disabledReason: string | null;
            disabledBy: string | null;
        };
        expect(body.id).toBe(endpointId);
        expect(body.disabledAt).not.toBeNull();
        expect(body.disabledReason).toBe("repeated timeouts");
        expect(body.disabledBy).toBe("monitor");

        const db = drizzle(env.DB, { schema });
        const [row] = await db
            .select()
            .from(schema.communityEndpoint)
            .where(eq(schema.communityEndpoint.id, endpointId));
        expect(row.disabledAt).not.toBeNull();
        expect(row.disabledReason).toBe("repeated timeouts");
    });

    test("rejects deactivate without a reason", async () => {
        const ownerUserId = await insertCommunityEndpointOwner(
            `owner-${crypto.randomUUID().slice(0, 8)}`,
        );
        const endpointId = await insertCommunityEndpoint(ownerUserId);

        const response = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints/${endpointId}/deactivate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.COMMUNITY_MONITOR_TOKEN}`,
                },
                body: JSON.stringify({}),
            },
        );
        expect(response.status).toBe(400);
    });

    test("lists community endpoints with disabled state via the admin token", async () => {
        const githubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId = await insertCommunityEndpointOwner(githubUsername);
        const endpointId = await insertCommunityEndpoint(ownerUserId, {
            disabledAt: new Date(),
            disabledReason: "already disabled",
            disabledBy: "monitor",
        });

        const response = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints`,
            {
                headers: { Authorization: `Bearer ${env.PLN_ENTER_TOKEN}` },
            },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            data: {
                id: string;
                modelId: string;
                disabledAt: string | null;
                disabledReason: string | null;
            }[];
        };
        const listed = body.data.find((row) => row.id === endpointId);
        expect(listed).toBeDefined();
        expect(listed?.modelId).toContain(githubUsername);
        expect(listed?.disabledReason).toBe("already disabled");
    });

    test("maintainer reactivate via admin token clears the disabled state", async () => {
        const ownerUserId = await insertCommunityEndpointOwner(
            `owner-${crypto.randomUUID().slice(0, 8)}`,
        );
        const endpointId = await insertCommunityEndpoint(ownerUserId, {
            disabledAt: new Date(),
            disabledReason: "was failing",
            disabledBy: "monitor",
        });

        const response = await SELF.fetch(
            `${BASE}/api/admin/community-endpoints/${endpointId}/reactivate`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${env.PLN_ENTER_TOKEN}` },
            },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { disabledAt: string | null };
        expect(body.disabledAt).toBeNull();
    });

    test("owner reactivate clears disabledAt/disabledReason and enforces ownership", async () => {
        const ownerGithubUsername = `owner-${crypto.randomUUID().slice(0, 8)}`;
        const ownerUserId =
            await insertCommunityEndpointOwner(ownerGithubUsername);
        const endpointId = await insertCommunityEndpoint(ownerUserId, {
            disabledAt: new Date(),
            disabledReason: "was failing",
            disabledBy: "monitor",
        });
        const ownerCookie = await signedSessionCookie(ownerUserId);

        // A different user cannot reactivate someone else's endpoint.
        const otherUserId = await insertCommunityEndpointOwner(
            `other-${crypto.randomUUID().slice(0, 8)}`,
        );
        const otherCookie = await signedSessionCookie(otherUserId);
        const deniedResponse = await SELF.fetch(
            `${BASE}/api/account/my-models/${endpointId}/reactivate`,
            { method: "POST", headers: { Cookie: otherCookie } },
        );
        expect(deniedResponse.status).toBe(404);

        const response = await SELF.fetch(
            `${BASE}/api/account/my-models/${endpointId}/reactivate`,
            { method: "POST", headers: { Cookie: ownerCookie } },
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            disabled: boolean;
            disabledReason: string | null;
            disabledAt: string | null;
        };
        expect(body.disabled).toBe(false);
        expect(body.disabledReason).toBeNull();
        expect(body.disabledAt).toBeNull();
    });
});
