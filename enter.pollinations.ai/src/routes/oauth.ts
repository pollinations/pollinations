import { redirectUriMatchesAllowlist } from "@shared/auth/redirect-uri.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    type DeviceTokenRequest,
    exchangeDeviceCode,
    handleUserinfo,
} from "./device.ts";
import { getRedirectUris, parseMetadata } from "./metadata-utils.ts";

const KV_TTL = 600; // 10 minutes — codes are single-use and short-lived
const CODE_LENGTH = 40;
export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** What the consent page stored when the user approved the request. */
type StoredCode = {
    key: string;
    clientId: string;
    redirectUri: string;
    scope: string | null;
    codeChallenge: string;
    expiresIn: number | null;
};

function generateCode(length: number): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * PKCE S256 check (RFC 7636 §4.6): BASE64URL(SHA256(verifier)) == challenge.
 * Verifier charset/length per RFC 7636 §4.1.
 */
async function verifyPkceS256(
    verifier: string,
    challenge: string,
): Promise<boolean> {
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    const computed = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return computed === challenge;
}

/**
 * Token requests are form-encoded per RFC 6749 §3.2; JSON is accepted as a
 * convenience (the device flow has always been JSON-only).
 */
async function parseTokenRequest(
    c: Context<Env>,
): Promise<Record<string, string>> {
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const body = await c.req
            .json<Record<string, unknown>>()
            .catch(() => ({}));
        return Object.fromEntries(
            Object.entries(body).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
            ),
        );
    }
    const body = await c.req.parseBody().catch(() => ({}));
    return Object.fromEntries(
        Object.entries(body).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
    );
}

function tokenError(
    c: Context<Env>,
    error: string,
    description?: string,
    status: 400 | 401 = 400,
) {
    c.header("Cache-Control", "no-store");
    return c.json(
        { error, ...(description && { error_description: description }) },
        status,
    );
}

const CreateCodeSchema = z.object({
    apiKey: z.string().min(1),
    clientId: z.string().startsWith("pk_"),
    redirectUri: z.string().min(1),
    scope: z.string().optional(),
    // S256 challenge is exactly 43 base64url chars (SHA-256, unpadded)
    codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    codeChallengeMethod: z.literal("S256"),
    expiresIn: z.number().int().positive().nullish(),
});

/**
 * OAuth 2.1 authorization-code grant with PKCE (S256 only), layered on the
 * same trust model as the device flow: the consent page mints the sk_ in the
 * browser and hands it to the server, which parks it in KV behind a
 * single-use authorization code. The legacy fragment (#api_key=) flow is
 * untouched — this is an additional issuance path, not a replacement.
 *
 * POST /code     — called by the consent page after the user approves
 * POST /token    — code+PKCE (and device_code) exchange, RFC 6749 §3.2
 * GET  /userinfo — alias of /api/device/userinfo for discovery metadata
 */
export const oauthRoutes = new Hono<Env>()
    .post(
        "/code",
        auth({ allowApiKey: false, allowSessionCookie: true }),
        validator("json", CreateCodeSchema),
        async (c) => {
            c.var.auth.requireUser();
            const body = c.req.valid("json");

            // Re-validate the client/redirect binding server-side; the same
            // check runs at sk_ minting, but the code is the artifact that
            // leaves our origin, so it must never bind an unregistered
            // redirect (RFC 6749 §3.1.2).
            const authInstance = createAuth(c.env);
            const result = await authInstance.api.verifyApiKey({
                body: { key: body.clientId },
            });
            if (!result.valid || !result.key) {
                throw new HTTPException(400, {
                    message: "Unknown client_id",
                });
            }
            const db = drizzle(c.env.DB, { schema });
            const keyRow = await db.query.apikey.findFirst({
                where: eq(schema.apikey.id, result.key.id),
            });
            const allowlist = keyRow
                ? getRedirectUris(parseMetadata(keyRow.metadata))
                : [];
            if (!redirectUriMatchesAllowlist(body.redirectUri, allowlist)) {
                throw new HTTPException(400, {
                    message:
                        "redirect_uri is not registered for this client_id",
                });
            }

            const code = generateCode(CODE_LENGTH);
            const stored: StoredCode = {
                key: body.apiKey,
                clientId: body.clientId,
                redirectUri: body.redirectUri,
                // "" is meaningful: the user narrowed a requested scope to
                // zero, and RFC 6749 §5.1 requires the token response to say so
                scope: body.scope ?? null,
                codeChallenge: body.codeChallenge,
                expiresIn: body.expiresIn ?? null,
            };
            await c.env.KV.put(`oauth-code:${code}`, JSON.stringify(stored), {
                expirationTtl: KV_TTL,
            });

            return c.json({ code });
        },
    )
    .post("/token", async (c) => {
        // RFC 6749 §5.1: every token-endpoint response is uncacheable —
        // including the device grant delegated below (its own legacy
        // /api/device/token endpoint is left byte-identical).
        c.header("Cache-Control", "no-store");
        const body = await parseTokenRequest(c);

        if (body.grant_type === DEVICE_CODE_GRANT) {
            return await exchangeDeviceCode(c, body as DeviceTokenRequest);
        }
        if (body.grant_type !== "authorization_code") {
            return tokenError(
                c,
                "unsupported_grant_type",
                "Only authorization_code and device_code are supported.",
            );
        }
        if (!body.code || !body.client_id || !body.code_verifier) {
            return tokenError(
                c,
                "invalid_request",
                "code, client_id, and code_verifier are required.",
            );
        }

        const kvKey = `oauth-code:${body.code}`;
        const stored = (await c.env.KV.get(kvKey, "json")) as StoredCode | null;
        if (!stored) {
            return tokenError(
                c,
                "invalid_grant",
                "Code unknown, expired, or already used.",
            );
        }
        // Single use (OAuth 2.1 §4.1.3): burn the code before validating so a
        // failed attempt can't be retried against the same code.
        await c.env.KV.delete(kvKey);

        if (body.client_id !== stored.clientId) {
            return tokenError(c, "invalid_client", "client_id mismatch", 401);
        }
        // redirect_uri is optional under OAuth 2.1 (PKCE binds the request),
        // but when present it must match the authorization request exactly.
        if (body.redirect_uri && body.redirect_uri !== stored.redirectUri) {
            return tokenError(c, "invalid_grant", "redirect_uri mismatch");
        }
        if (!(await verifyPkceS256(body.code_verifier, stored.codeChallenge))) {
            return tokenError(c, "invalid_grant", "PKCE verification failed");
        }

        return c.json({
            access_token: stored.key,
            token_type: "bearer",
            ...(stored.expiresIn != null && { expires_in: stored.expiresIn }),
            ...(stored.scope != null && { scope: stored.scope }),
        });
    })
    .get(
        "/userinfo",
        auth({ allowApiKey: true, allowSessionCookie: true }),
        (c) => handleUserinfo(c),
    );
