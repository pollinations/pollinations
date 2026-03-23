import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import * as schema from "@/db/schema/better-auth.ts";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";

/** Insert a device code directly into D1. */
async function insertDeviceCode(
    overrides: Partial<typeof schema.deviceCode.$inferInsert> = {},
) {
    const db = drizzle(env.DB, { schema });
    const row = {
        id: crypto.randomUUID(),
        deviceCode: crypto.randomUUID(),
        userCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000),
        clientId: "test-client",
        scope: "generate",
        ...overrides,
    };
    await db.insert(schema.deviceCode).values(row);
    return row;
}

/** Insert an API key directly into D1, returning the plaintext key. */
async function insertApiKey(userId: string) {
    const db = drizzle(env.DB, { schema });
    const key = `sk_${crypto.randomUUID().replace(/-/g, "")}`;
    const row = {
        id: crypto.randomUUID(),
        key,
        name: "device-test",
        start: key.slice(0, 13),
        prefix: "sk",
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    await db.insert(schema.apikey).values(row);
    return { key, id: row.id };
}

describe("Device Authorization Flow", () => {
    test("POST /api/device/code issues device and user codes", async () => {
        const res = await SELF.fetch(`${BASE}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: "test-cli", scope: "generate" }),
        });
        const body = (await res.json()) as {
            device_code: string;
            user_code: string;
            verification_uri: string;
            verification_uri_complete: string;
            expires_in: number;
            interval: number;
        };
        expect(res.status).toBe(200);
        expect(body.device_code).toBeTruthy();
        expect(body.user_code).toHaveLength(8);
        expect(body.verification_uri).toContain("/device");
        expect(body.verification_uri_complete).toContain(
            `user_code=${body.user_code}`,
        );
        expect(body.expires_in).toBe(1800);
        expect(body.interval).toBe(5);

        // Verify the code was persisted — info endpoint should return it
        const infoRes = await SELF.fetch(
            `${BASE}/api/device/info?user_code=${body.user_code}`,
        );
        expect(infoRes.status).toBe(200);
        const info = (await infoRes.json()) as {
            status: string;
            scope: string;
        };
        expect(info.status).toBe("pending");
        expect(info.scope).toBe("generate");
    });

    test("GET /api/device/info with valid code returns pending", async () => {
        const device = await insertDeviceCode();
        const res = await SELF.fetch(
            `${BASE}/api/device/info?user_code=${device.userCode}`,
        );
        const info = (await res.json()) as { status: string; scope: string };
        expect(res.status).toBe(200);
        expect(info.status).toBe("pending");
        expect(info.scope).toBe("generate");
    });

    test("GET /api/device/info with invalid code returns 400", async () => {
        const res = await SELF.fetch(
            `${BASE}/api/device/info?user_code=INVALID`,
        );
        expect(res.status).toBe(400);
    });

    test(
        "deny flow: token returns access_denied after deny",
        async ({ sessionToken, mocks }) => {
            await mocks.enable("polar", "tinybird", "github");
            const device = await insertDeviceCode();

            const denyRes = await SELF.fetch(`${BASE}/api/device/deny`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({ userCode: device.userCode }),
            });
            expect(denyRes.status).toBe(200);

            const tokenRes = await SELF.fetch(`${BASE}/api/device/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: device.deviceCode }),
            });
            const body = (await tokenRes.json()) as { error: string };
            expect(tokenRes.status).toBe(400);
            expect(body.error).toBe("access_denied");
        },
        { timeout: 30000 },
    );

    test("expired code returns error on info and token", async () => {
        const device = await insertDeviceCode({
            expiresAt: new Date(Date.now() - 1000),
        });

        const infoRes = await SELF.fetch(
            `${BASE}/api/device/info?user_code=${device.userCode}`,
        );
        expect(infoRes.status).toBe(400);
        const infoBody = (await infoRes.json()) as { error: string };
        expect(infoBody.error).toBe("expired_token");

        const tokenRes = await SELF.fetch(`${BASE}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: device.deviceCode }),
        });
        expect(tokenRes.status).toBe(400);
        const tokenBody = (await tokenRes.json()) as { error: string };
        expect(tokenBody.error).toBe("expired_token");
    });

    test("client_id mismatch returns invalid_client on token", async () => {
        const device = await insertDeviceCode({ clientId: "app-a" });
        const res = await SELF.fetch(`${BASE}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_code: device.deviceCode,
                client_id: "app-b",
            }),
        });
        const body = (await res.json()) as { error: string };
        expect(res.status).toBe(400);
        expect(body.error).toBe("invalid_client");
    });

    test("POST /api/device/token before approval returns authorization_pending", async () => {
        const device = await insertDeviceCode();
        const res = await SELF.fetch(`${BASE}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: device.deviceCode }),
        });
        const body = (await res.json()) as { error: string };
        expect(res.status).toBe(400);
        expect(body.error).toBe("authorization_pending");
    });

    test("POST /api/device/approve without auth returns 401", async () => {
        const res = await SELF.fetch(`${BASE}/api/device/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userCode: "XXXX",
                apiKey: "sk_test",
                apiKeyId: "id",
            }),
        });
        expect(res.status).toBe(401);
    });

    test(
        "full flow: approve device code, poll for key",
        { timeout: 30000 },
        async ({ sessionToken, mocks }) => {
            await mocks.enable("polar", "tinybird", "github");
            const device = await insertDeviceCode();

            // Get the user ID from session
            const sessionRes = await SELF.fetch(
                `${BASE}/api/auth/get-session`,
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const session = (await sessionRes.json()) as {
                user: { id: string };
            };
            const { key, id: keyId } = await insertApiKey(session.user.id);

            // Approve the device code
            const approveRes = await SELF.fetch(`${BASE}/api/device/approve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    userCode: device.userCode,
                    apiKey: key,
                    apiKeyId: keyId,
                }),
            });
            expect(approveRes.status).toBe(200);

            // Poll for the token
            const tokenRes = await SELF.fetch(`${BASE}/api/device/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: device.deviceCode }),
            });
            const tokenBody = (await tokenRes.json()) as {
                access_token: string;
                token_type: string;
                scope?: string;
            };
            expect(tokenRes.status).toBe(200);
            expect(tokenBody.access_token).toBe(key);
            expect(tokenBody.token_type).toBe("bearer");
            expect(tokenBody.scope).toBe("generate");

            // Replay protection: row deleted, so polling returns invalid_grant
            const replayRes = await SELF.fetch(`${BASE}/api/device/token`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_code: device.deviceCode }),
            });
            const replayBody = (await replayRes.json()) as { error: string };
            expect(replayRes.status).toBe(400);
            expect(replayBody.error).toBe("invalid_grant");
        },
    );

    test(
        "GET /api/device/userinfo returns OIDC-shaped profile",
        { timeout: 30000 },
        async ({ sessionToken, mocks }) => {
            await mocks.enable("polar", "tinybird", "github");
            const res = await SELF.fetch(`${BASE}/api/device/userinfo`, {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            });
            const body = (await res.json()) as {
                sub: string;
                name: string;
                preferred_username: string | null;
            };
            expect(res.status).toBe(200);
            expect(body.sub).toBeTruthy();
            expect(body.name).toBeTruthy();
            expect(body).toHaveProperty("email");
            expect(body).toHaveProperty("picture");
            expect(body).toHaveProperty("preferred_username");
        },
    );
});
