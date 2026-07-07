import { PKCE_S256_CHALLENGE_REGEX } from "@shared/auth/authorize-config.ts";
import { redirectUriMatchesAllowlistExact } from "@shared/auth/redirect-uri.ts";
import { validator } from "@shared/middleware/validator.ts";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import {
    type DeviceTokenRequest,
    exchangeDeviceCode,
    generateCode,
    handleUserinfo,
    parseFormOrJsonBody,
} from "./device.ts";
import { getRedirectUris } from "./metadata-utils.ts";

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

function tokenError(c: Context<Env>, error: string, description?: string) {
    return c.json(
        { error, ...(description && { error_description: description }) },
        400,
    );
}

const CreateCodeSchema = z.object({
    apiKey: z.string().min(1),
    clientId: z.string().startsWith("pk_"),
    redirectUri: z.string().min(1),
    scope: z.string().optional(),
    codeChallenge: z.string().regex(PKCE_S256_CHALLENGE_REGEX),
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
            // redirect (RFC 6749 §3.1.2). verifyApiKey returns the key row
            // with metadata already parsed.
            const result = await c.var.auth.client.api.verifyApiKey({
                body: { key: body.clientId },
            });
            if (!result.valid || !result.key) {
                throw new HTTPException(400, {
                    message: "Unknown client_id",
                });
            }
            // Exact matching (incl. query) — the code rides the query string,
            // so the legacy flow's extra-query leniency doesn't apply here.
            const allowlist = getRedirectUris(result.key.metadata ?? {});
            if (
                !redirectUriMatchesAllowlistExact(body.redirectUri, allowlist)
            ) {
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
        const body = await parseFormOrJsonBody(c);

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
        // redirect_uri is required per RFC 6749 §4.1.3 since the
        // authorization request always carries one. OAuth 2.1 drafts allow
        // omitting it (PKCE binds the transaction); we deliberately keep the
        // stricter rule for maximum client-library compatibility.
        if (
            !body.code ||
            !body.client_id ||
            !body.code_verifier ||
            !body.redirect_uri
        ) {
            return tokenError(
                c,
                "invalid_request",
                "code, client_id, redirect_uri, and code_verifier are required.",
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
            // Public clients never authenticate here (token auth "none"), so
            // a code issued to another client is a grant error, not a
            // client-authentication failure (RFC 6749 §5.2).
            return tokenError(
                c,
                "invalid_grant",
                "Code was issued to a different client_id.",
            );
        }
        if (body.redirect_uri !== stored.redirectUri) {
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
