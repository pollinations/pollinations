import { env, SELF } from "cloudflare:test";
import { bytesToHex } from "@shared/client-ip.ts";
import {
    apikeyRevocationAudit as apikeyRevocationAuditTable,
    apikey as apikeyTable,
} from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

// Must match [env.test.vars] GITHUB_SECRET_SCANNING_WEBHOOK_SECRET.
const WEBHOOK_SECRET = "test_github_secret_scanning_webhook_secret";
const WEBHOOK_URL = "http://localhost:3000/api/webhooks/github-secret-scanning";

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(body),
    );
    return bytesToHex(signature);
}

async function signedBody(payload: unknown): Promise<{
    raw: string;
    signature: string;
}> {
    const raw = JSON.stringify(payload);
    return {
        raw,
        signature: `sha256=${await hmacSha256Hex(WEBHOOK_SECRET, raw)}`,
    };
}

describe("GitHub Secret Scanning webhook", () => {
    test("revokes a leaked key and acknowledges with 200", async ({
        apiKey,
    }) => {
        const { raw, signature } = await signedBody({
            token: apiKey,
            url: "https://github.com/example/repo/commit/abc123",
            source: "web",
            type: "sk",
        });

        const response = await SELF.fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-hub-signature-256": signature,
            },
            body: raw,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            revoked: true,
        });

        const db = drizzle(env.DB);
        expect(await db.select().from(apikeyTable).all()).toHaveLength(0);
        const auditRows = await db
            .select()
            .from(apikeyRevocationAuditTable)
            .all();
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]?.triggeredBy).toBe("github-secret-scanning");
        expect(auditRows[0]?.reference).toBe(
            "https://github.com/example/repo/commit/abc123",
        );
    });

    test("acknowledges unknown tokens without revoking", async () => {
        const { raw, signature } = await signedBody({
            token: `sk_${"a".repeat(32)}`,
            url: "https://github.com/example/repo/commit/def456",
        });

        const response = await SELF.fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-hub-signature-256": signature,
            },
            body: raw,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            revoked: false,
        });

        const db = drizzle(env.DB);
        expect(
            await db.select().from(apikeyRevocationAuditTable).all(),
        ).toHaveLength(0);
    });

    test("rejects an invalid signature", async () => {
        const response = await SELF.fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
            },
            body: JSON.stringify({ token: `sk_${"a".repeat(32)}` }),
        });

        expect(response.status).toBe(401);
    });

    test("rejects a payload without a token", async () => {
        const { raw, signature } = await signedBody({
            url: "https://example.com",
        });

        const response = await SELF.fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-hub-signature-256": signature,
            },
            body: raw,
        });

        expect(response.status).toBe(400);
    });
});
