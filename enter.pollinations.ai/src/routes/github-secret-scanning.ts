import { hashApiKey, revokeApiKeyByHash } from "@shared/auth/revoke-api-key.ts";
import { bytesToHex } from "@shared/client-ip.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

const SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * GitHub Secret Scanning Partner Program callback. GitHub POSTs leaked token
 * payloads here; we hash the token and force-revoke the matching key.
 *
 * Inert until the `GITHUB_SECRET_SCANNING_WEBHOOK_SECRET` secret is configured
 * (program registration). Signature is HMAC-SHA256 of the raw body.
 */
export const githubSecretScanningRoutes = new Hono<Env>().post(
    "/",
    async (c) => {
        const env = c.env as CloudflareBindings & {
            GITHUB_SECRET_SCANNING_WEBHOOK_SECRET?: string;
        };
        const webhookSecret = env.GITHUB_SECRET_SCANNING_WEBHOOK_SECRET;

        if (!webhookSecret) {
            // Program not registered yet — acknowledge and ignore.
            return c.json({ success: true, configured: false }, 200);
        }

        const rawBody = await c.req.text();
        const expected = `sha256=${await hmacSha256Hex(webhookSecret, rawBody)}`;
        const signatureHeader = c.req.header(SIGNATURE_HEADER);
        if (!signatureHeader || !constantTimeEqual(signatureHeader, expected)) {
            throw new HTTPException(401, { message: "Invalid signature" });
        }

        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
            throw new HTTPException(400, { message: "Invalid JSON body" });
        }

        const { token, url } = payload;
        if (typeof token !== "string" || token.length === 0) {
            throw new HTTPException(400, { message: "Missing token" });
        }

        const keyHash = await hashApiKey(token);
        const result = await revokeApiKeyByHash(drizzle(c.env.DB), {
            keyHash,
            triggeredBy: "github-secret-scanning",
            source: "github_secret_scanning",
            reference: typeof url === "string" ? url : undefined,
        });

        return c.json({ success: true, revoked: result !== null }, 200);
    },
);

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

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
