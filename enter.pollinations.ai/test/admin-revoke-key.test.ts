import { env, SELF } from "cloudflare:test";
import { defaultKeyHasher } from "@better-auth/api-key";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

describe("POST /admin/revoke-key", () => {
    test("revokes a key by plaintext value", async ({ apiKey }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/admin/revoke-key",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ key: apiKey }),
            },
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.revoked).toBe(true);

        const db = drizzle(env.DB, { schema });
        const hashed = await defaultKeyHasher(apiKey);
        const stored = await db.query.apikey.findFirst({
            where: (apikey, { eq: eqCol }) => eqCol(apikey.key, hashed),
        });
        expect(stored?.enabled).toBe(false);
    });

    test("revokes a key by hash for Discord-style callers", async ({
        paidApiKey,
    }) => {
        const hashed = await defaultKeyHasher(paidApiKey);
        const response = await SELF.fetch(
            "http://localhost:3000/api/admin/revoke-key",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ keyHash: hashed }),
            },
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.revoked).toBe(true);

        const db = drizzle(env.DB, { schema });
        const stored = await db.query.apikey.findFirst({
            where: (apikey, { eq: eqCol }) => eqCol(apikey.key, hashed),
        });
        expect(stored?.enabled).toBe(false);
    });

    test("rejects unauthenticated callers", async ({ apiKey }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/admin/revoke-key",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: apiKey }),
            },
        );
        expect(response.status).toBe(401);
    });

    test("returns not_found for unknown hashes", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/admin/revoke-key",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ keyHash: "missing-hash" }),
            },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            success: true,
            revoked: false,
            reason: "not_found",
        });
    });
});
