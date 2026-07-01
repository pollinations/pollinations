import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";

// RFC 7636 Appendix B test vector
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const REDIRECT_URI = "https://app.example/cb";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

async function s256(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** Park an authorization code in KV the way POST /api/oauth/code does. */
async function putCode(
    code: string,
    overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
    const stored = {
        key: "sk_test_access_token",
        clientId: "pk_test_client",
        redirectUri: REDIRECT_URI,
        scope: "profile",
        codeChallenge: await s256(VERIFIER),
        expiresIn: 604800,
        ...overrides,
    };
    await env.KV.put(`oauth-code:${code}`, JSON.stringify(stored), {
        expirationTtl: 600,
    });
    return stored;
}

function formPost(params: Record<string, string>): RequestInit {
    return {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
    };
}

function validTokenParams(code: string): Record<string, string> {
    return {
        grant_type: "authorization_code",
        code,
        client_id: "pk_test_client",
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
    };
}

describe("OAuth authorization server metadata", () => {
    test("GET /.well-known/oauth-authorization-server returns RFC 8414 metadata", async () => {
        const res = await SELF.fetch(
            `${BASE}/.well-known/oauth-authorization-server`,
        );
        expect(res.status).toBe(200);
        const meta = (await res.json()) as Record<string, unknown>;
        expect(meta.issuer).toBe(BASE);
        expect(meta.authorization_endpoint).toBe(`${BASE}/authorize`);
        expect(meta.token_endpoint).toBe(`${BASE}/api/oauth/token`);
        expect(meta.userinfo_endpoint).toBe(`${BASE}/api/oauth/userinfo`);
        expect(meta.device_authorization_endpoint).toBe(
            `${BASE}/api/device/code`,
        );
        expect(meta.response_types_supported).toEqual(["code"]);
        expect(meta.grant_types_supported).toEqual([
            "authorization_code",
            DEVICE_GRANT,
        ]);
        expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
        expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);
    });
});

describe("POST /api/oauth/token (authorization_code + PKCE)", () => {
    test("exchanges a valid code for the access token, single use", async () => {
        const code = crypto.randomUUID();
        await putCode(code);

        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(validTokenParams(code)),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.access_token).toBe("sk_test_access_token");
        expect(body.token_type).toBe("bearer");
        expect(body.scope).toBe("profile");
        expect(body.expires_in).toBe(604800);

        // Replay: the code is burned on first use
        const replay = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(validTokenParams(code)),
        );
        expect(replay.status).toBe(400);
        const replayBody = (await replay.json()) as { error: string };
        expect(replayBody.error).toBe("invalid_grant");
    });

    test("accepts a JSON body as well as form encoding", async () => {
        const code = crypto.randomUUID();
        await putCode(code);
        const res = await SELF.fetch(`${BASE}/api/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validTokenParams(code)),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { access_token: string };
        expect(body.access_token).toBe("sk_test_access_token");
    });

    test("omitting redirect_uri is allowed (PKCE binds the request)", async () => {
        const code = crypto.randomUUID();
        await putCode(code);
        const params = validTokenParams(code);
        delete params.redirect_uri;
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(params),
        );
        expect(res.status).toBe(200);
    });

    test("wrong code_verifier returns invalid_grant and burns the code", async () => {
        const code = crypto.randomUUID();
        await putCode(code);
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({
                ...validTokenParams(code),
                code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier",
            }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("invalid_grant");

        // The failed attempt consumed the code — the right verifier is too late
        const retry = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(validTokenParams(code)),
        );
        const retryBody = (await retry.json()) as { error: string };
        expect(retryBody.error).toBe("invalid_grant");
    });

    test("client_id mismatch returns invalid_client", async () => {
        const code = crypto.randomUUID();
        await putCode(code);
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({
                ...validTokenParams(code),
                client_id: "pk_other_client",
            }),
        );
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("invalid_client");
    });

    test("redirect_uri mismatch returns invalid_grant", async () => {
        const code = crypto.randomUUID();
        await putCode(code);
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({
                ...validTokenParams(code),
                redirect_uri: "https://evil.example/cb",
            }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("invalid_grant");
    });

    test("unknown code returns invalid_grant", async () => {
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(validTokenParams("nonexistent-code")),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("invalid_grant");
    });

    test("unsupported grant_type is rejected", async () => {
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({ grant_type: "password", username: "a", password: "b" }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("unsupported_grant_type");
    });

    test("missing required params returns invalid_request", async () => {
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({ grant_type: "authorization_code", code: "abc" }),
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: string };
        expect(body.error).toBe("invalid_request");
    });

    test("device_code grant works through the standard token endpoint", async () => {
        const db = drizzle(env.DB, { schema });
        const deviceCode = crypto.randomUUID();
        await db.insert(schema.deviceCode).values({
            id: crypto.randomUUID(),
            deviceCode,
            userCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
            status: "approved",
            expiresAt: new Date(Date.now() + 600_000),
            clientId: null,
            scope: "profile",
        });
        await env.KV.put(
            `device-key:${deviceCode}`,
            JSON.stringify({ key: "sk_device_key", expiresIn: null }),
            { expirationTtl: 600 },
        );

        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({ grant_type: DEVICE_GRANT, device_code: deviceCode }),
        );
        expect(res.status).toBe(200);
        // RFC 6749 §5.1 applies to every grant on the advertised endpoint
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        const body = (await res.json()) as {
            access_token: string;
            token_type: string;
        };
        expect(body.access_token).toBe("sk_device_key");
        expect(body.token_type).toBe("bearer");
    });

    test("scope narrowed to zero is echoed as an empty scope (RFC 6749 §5.1)", async () => {
        const code = crypto.randomUUID();
        await putCode(code, { scope: "" });
        const res = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost(validTokenParams(code)),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { scope?: string };
        expect(body.scope).toBe("");
    });
});

describe("POST /api/oauth/code (consent-side code creation)", () => {
    test("requires a session", async () => {
        const res = await SELF.fetch(`${BASE}/api/oauth/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                apiKey: "sk_x",
                clientId: "pk_x",
                redirectUri: REDIRECT_URI,
                codeChallenge: await s256(VERIFIER),
                codeChallengeMethod: "S256",
            }),
        });
        expect(res.status).toBe(401);
    });

    test("full flow: register client, create code, exchange for token", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird", "github");

        // Register the OAuth client: a pk_ App Key with a redirect allowlist
        const createRes = await SELF.fetch(`${BASE}/api/api-keys`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({ name: "alp-test", type: "publishable" }),
        });
        expect(createRes.status).toBe(200);
        const client = (await createRes.json()) as { id: string; key: string };
        expect(client.key.startsWith("pk_")).toBe(true);

        const metaRes = await SELF.fetch(
            `${BASE}/api/api-keys/${client.id}/metadata`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({ redirectUris: [REDIRECT_URI] }),
            },
        );
        expect(metaRes.status).toBe(200);

        // Consent approve: park the minted key behind a code
        const codeRes = await SELF.fetch(`${BASE}/api/oauth/code`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                apiKey: "sk_minted_by_consent",
                clientId: client.key,
                redirectUri: REDIRECT_URI,
                scope: "profile",
                codeChallenge: await s256(VERIFIER),
                codeChallengeMethod: "S256",
                expiresIn: 3600,
            }),
        });
        expect(codeRes.status).toBe(200);
        const { code } = (await codeRes.json()) as { code: string };
        expect(code).toBeTruthy();

        // Client-side exchange, exactly what alp's backend will send
        const tokenRes = await SELF.fetch(
            `${BASE}/api/oauth/token`,
            formPost({
                grant_type: "authorization_code",
                code,
                client_id: client.key,
                redirect_uri: REDIRECT_URI,
                code_verifier: VERIFIER,
            }),
        );
        expect(tokenRes.status).toBe(200);
        const token = (await tokenRes.json()) as {
            access_token: string;
            token_type: string;
            expires_in: number;
            scope: string;
        };
        expect(token.access_token).toBe("sk_minted_by_consent");
        expect(token.token_type).toBe("bearer");
        expect(token.expires_in).toBe(3600);
        expect(token.scope).toBe("profile");
    }, 30000);

    test("rejects an unregistered redirect_uri", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird", "github");

        const createRes = await SELF.fetch(`${BASE}/api/api-keys`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({ name: "alp-test", type: "publishable" }),
        });
        const client = (await createRes.json()) as { id: string; key: string };

        // No redirectUris registered at all → any redirect must be rejected
        const codeRes = await SELF.fetch(`${BASE}/api/oauth/code`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                apiKey: "sk_minted_by_consent",
                clientId: client.key,
                redirectUri: "https://evil.example/cb",
                codeChallenge: await s256(VERIFIER),
                codeChallengeMethod: "S256",
            }),
        });
        expect(codeRes.status).toBe(400);
    }, 30000);

    test("rejects a malformed code_challenge", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird", "github");
        const res = await SELF.fetch(`${BASE}/api/oauth/code`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                apiKey: "sk_x",
                clientId: "pk_x",
                redirectUri: REDIRECT_URI,
                codeChallenge: "too-short",
                codeChallengeMethod: "S256",
            }),
        });
        expect(res.status).toBe(400);
    }, 30000);
});

describe("GET /api/oauth/userinfo", () => {
    test("returns the same OIDC-shaped profile as the device alias", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird", "github");
        const res = await SELF.fetch(`${BASE}/api/oauth/userinfo`, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { sub: string };
        expect(body.sub).toBeTruthy();
        expect(body).toHaveProperty("email");
        expect(body).toHaveProperty("preferred_username");
    }, 30000);
});
