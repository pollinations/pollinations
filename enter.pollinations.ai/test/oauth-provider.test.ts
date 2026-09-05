import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";
const CLIENT_ID = "pk_Bxny9FSNDpousKqW";
const REDIRECT_URI = "https://kpi.pollinations.ai/auth/callback";
const VERIFIER = "test-verifier-that-is-at-least-forty-three-characters";

function base64Url(bytes: Uint8Array) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

async function challenge() {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(VERIFIER),
    );
    return base64Url(new Uint8Array(digest));
}

async function authorize(sessionToken?: string) {
    const url = new URL(`${BASE}/api/auth/oauth2/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", "test-state");
    url.searchParams.set("code_challenge", await challenge());
    url.searchParams.set("code_challenge_method", "S256");
    return SELF.fetch(url, {
        headers: {
            Accept: "text/html",
            ...(sessionToken && {
                Cookie: `better-auth.session_token=${sessionToken}`,
            }),
        },
        redirect: "manual",
    });
}

async function completeFlow(sessionToken: string) {
    const authorization = await authorize(sessionToken);
    const callback = new URL(authorization.headers.get("Location") || "");
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("Expected authorization code");

    const tokenResponse = await SELF.fetch(`${BASE}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_verifier: VERIFIER,
        }),
    });
    const token = (await tokenResponse.json()) as {
        access_token: string;
        expires_in: number;
        scope: string;
    };
    const userinfo = await SELF.fetch(`${BASE}/api/auth/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });

    return {
        authorization,
        callback,
        tokenResponse,
        token,
        userinfo,
        profile: (await userinfo.json()) as Record<string, unknown>,
    };
}

describe("Better Auth OAuth Provider", () => {
    test("continues the standard flow through sign-in", async () => {
        const response = await authorize();
        expect(response.status).toBe(302);

        const location = new URL(response.headers.get("Location") || "", BASE);
        expect(location.pathname).toBe("/sign-in");
        expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
        expect(location.searchParams.get("sig")).toBeTruthy();
    });

    test("returns the admin role through UserInfo", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB, { schema });
        await db.update(schema.user).set({ role: "admin" });

        const {
            authorization,
            callback,
            tokenResponse,
            token,
            userinfo,
            profile,
        } = await completeFlow(sessionToken);
        expect(authorization.status).toBe(302);
        expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
        expect(callback.searchParams.get("state")).toBe("test-state");
        expect(tokenResponse.status).toBe(200);
        expect(token.access_token).toBeTruthy();
        expect(token.expires_in).toBe(60);
        expect(token.scope).toBe("openid profile email");
        expect(userinfo.status).toBe(200);
        expect(profile).toMatchObject({
            email: expect.any(String),
            role: "admin",
            sub: expect.any(String),
        });
    });

    test("authenticates non-admins with a user role", async ({
        sessionToken,
    }) => {
        const { authorization, tokenResponse, userinfo, profile } =
            await completeFlow(sessionToken);

        expect(authorization.status).toBe(302);
        expect(tokenResponse.status).toBe(200);
        expect(userinfo.status).toBe(200);
        expect(profile).toMatchObject({ role: "user" });
    });
});
