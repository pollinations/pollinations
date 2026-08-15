import { env, SELF } from "cloudflare:test";
import { hashApiKey } from "@shared/auth/revoke-api-key.ts";
import { apikey as apikeyTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const ADMIN_URL = "http://localhost:3000/api/admin/revoke-key";

describe("Admin revoke-key endpoint", () => {
    test("rejects requests without a token", async () => {
        const response = await SELF.fetch(ADMIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyHash: "a".repeat(64), source: "admin" }),
        });

        expect(response.status).toBe(401);
    });

    test("revokes a key by hash", async ({ apiKey }) => {
        const keyHash = await hashApiKey(apiKey);

        const response = await SELF.fetch(ADMIN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            },
            body: JSON.stringify({ keyHash, source: "admin" }),
        });

        expect(response.status).toBe(200);
        const data = (await response.json()) as {
            success: boolean;
            revoked: { apikeyId: string; ownerUserId: string };
        };
        expect(data.success).toBe(true);
        expect(data.revoked.apikeyId).toBeTruthy();
        expect(data.revoked.ownerUserId).toBeTruthy();

        const db = drizzle(env.DB);
        expect(await db.select().from(apikeyTable).all()).toHaveLength(0);
    });

    test("returns 404 for an unknown hash", async () => {
        const response = await SELF.fetch(ADMIN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            },
            body: JSON.stringify({ keyHash: "b".repeat(64), source: "admin" }),
        });

        expect(response.status).toBe(404);
    });

    test("rejects a malformed keyHash", async () => {
        const response = await SELF.fetch(ADMIN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            },
            body: JSON.stringify({ keyHash: "not-a-hash", source: "admin" }),
        });

        expect(response.status).toBe(400);
    });

    test("rejects an unknown source", async ({ apiKey }) => {
        const keyHash = await hashApiKey(apiKey);

        const response = await SELF.fetch(ADMIN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            },
            body: JSON.stringify({ keyHash, source: "evil" }),
        });

        expect(response.status).toBe(400);
    });
});
