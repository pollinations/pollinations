import { env, SELF } from "cloudflare:test";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, vi } from "vitest";
import { oauthSignInCallback } from "../frontend/src/lib/oauth-sign-in.ts";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";
const CLIENT_ID = "pk_vVa38CFt1R1gGScW";
const REDIRECT_URI = "https://observability.pollinations.ai/auth/callback";
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

async function authorize(
    sessionToken?: string,
    redirectUri = REDIRECT_URI,
    clientId = CLIENT_ID,
) {
    const url = new URL(`${BASE}/api/auth/oauth2/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
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

    const tokenResponse = await exchangeCode(code);
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

function exchangeCode(code: string, verifier = VERIFIER) {
    return SELF.fetch(`${BASE}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
            // Grafana's InParams auth style sends an empty public-client secret.
            client_secret: "",
        }),
    });
}

describe("Better Auth OAuth Provider", () => {
    test("rejects a wrong PKCE verifier", async ({ sessionToken }) => {
        const response = await authorize(sessionToken);
        const callback = new URL(response.headers.get("Location") || "");
        const code = callback.searchParams.get("code") || "";
        expect(code).toBeTruthy();
        const tokenResponse = await exchangeCode(code, "wrong-verifier");
        expect(tokenResponse.status).toBe(401);
    });

    test("does not exchange the same code twice", async ({ sessionToken }) => {
        const { callback } = await completeFlow(sessionToken);
        const replay = await exchangeCode(
            callback.searchParams.get("code") || "",
        );
        expect(replay.ok).toBe(false);
        expect(await replay.json()).not.toHaveProperty("access_token");
    });

    test.for([
        ["register", 403],
        ["create-client", 401],
    ] as const)("rejects client creation through %s", async ([path, status], {
        sessionToken,
    }) => {
        const response = await SELF.fetch(`${BASE}/api/auth/oauth2/${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
                Origin: BASE,
            },
            body: JSON.stringify({
                client_name: "Unregistered dashboard",
                redirect_uris: ["https://untrusted.pollinations.ai/callback"],
                token_endpoint_auth_method: "none",
                ...(path === "create-client" && { skip_consent: true }),
            }),
        });
        expect(response.status).toBe(status);
    });

    test("continues the standard flow through sign-in", async () => {
        const response = await authorize();
        expect(response.status).toBe(302);

        const location = new URL(response.headers.get("Location") || "", BASE);
        expect(location.pathname).toBe("/app/sign-in");
        expect(location.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
        expect(location.searchParams.get("code_challenge")).toBe(
            await challenge(),
        );
        expect(location.searchParams.get("client_id")).toBe(CLIENT_ID);
        expect(location.searchParams.get("sig")).toBeTruthy();
    });

    test("returns the admin role through UserInfo", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB, { schema });
        const current = await SELF.fetch(`${BASE}/api/auth/get-session`, {
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        });
        const { user } = (await current.json()) as {
            user: { id: string; email: string };
        };
        expect(user.email).toBe("test@example.com");
        await db
            .update(schema.user)
            .set({ role: "admin" })
            .where(
                and(
                    eq(schema.user.id, user.id),
                    eq(schema.user.email, "test@example.com"),
                ),
            );

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
        expect(token.expires_in).toBe(43_200);
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

test("fresh GitHub sign-in resumes the signed OAuth request through the actual client plugin", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    const authorization = await authorize();
    const loginPage = new URL(
        authorization.headers.get("Location") || "",
        BASE,
    );
    expect(loginPage.pathname).toBe("/app/sign-in");
    const onRequest = oauthProviderClient().fetchPlugins[0].hooks.onRequest;
    const context = {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            provider: "github",
            callbackURL: oauthSignInCallback(loginPage.toString()),
        }),
    };
    vi.stubGlobal("window", { location: { search: loginPage.search } });
    try {
        await onRequest(context as Parameters<typeof onRequest>[0]);
    } finally {
        vi.unstubAllGlobals();
    }
    expect(JSON.parse(context.body).oauth_query).toContain("sig=");
    const metadata = await SELF.fetch(
        `${BASE}/api/auth/oauth2/public-client-prelogin`,
        {
            method: "POST",
            headers: context.headers,
            body: JSON.stringify({
                client_id: CLIENT_ID,
                oauth_query: JSON.parse(context.body).oauth_query,
            }),
        },
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
        client_name: "Pollinations Observability",
    });
    const tampered = await SELF.fetch(
        `${BASE}/api/auth/oauth2/public-client-prelogin`,
        {
            method: "POST",
            headers: context.headers,
            body: JSON.stringify({
                client_id: CLIENT_ID,
                oauth_query: "sig=invalid",
            }),
        },
    );
    expect(tampered.status).toBe(400);

    const social = await SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: context.headers,
        body: context.body,
    });
    expect(social.status).toBe(200);
    const signup = (await social.json()) as { url: string };
    const callback = new URL(`${BASE}/api/auth/callback/github`);
    callback.searchParams.set("code", "test-code");
    callback.searchParams.set(
        "state",
        new URL(signup.url).searchParams.get("state") || "",
    );
    const completed = await SELF.fetch(callback, {
        headers: {
            Cookie: social.headers.get("Set-Cookie") || "",
            Accept: "text/html",
        },
        redirect: "manual",
    });
    expect(completed.status).toBe(302);
    const resume = new URL(completed.headers.get("Location") || "");
    expect(resume.pathname).toBe("/api/auth/oauth2/authorize");
    const resumed = await SELF.fetch(resume, {
        headers: {
            Cookie:
                completed.headers
                    .get("Set-Cookie")
                    ?.match(/better-auth\.session_token=[^;]+/)?.[0] || "",
            Accept: "text/html",
        },
        redirect: "manual",
    });
    expect(resumed.status).toBe(302);
    const app = new URL(resumed.headers.get("Location") || "", BASE);
    expect(app.origin + app.pathname).toBe(REDIRECT_URI);
    expect(app.searchParams.get("state")).toBe("test-state");
    expect(app.searchParams.get("code")).toBeTruthy();
    const token = await exchangeCode(app.searchParams.get("code") || "");
    expect(token.status).toBe(200);
});

for (const [app, clientId] of [
    ["kpi", "pk_Bxny9FSNDpousKqW"],
    ["economics", "pk_LBL0KnkHI6AZopCc"],
    ["observability", CLIENT_ID],
]) {
    for (const domain of ["myceli.ai", "pollinations.ai"]) {
        test(`accepts the registered ${app}.${domain} callback`, async ({
            sessionToken,
        }) => {
            const redirectUri = `https://${app}.${domain}/auth/callback`;
            const response = await authorize(
                sessionToken,
                redirectUri,
                clientId,
            );
            const callback = new URL(
                response.headers.get("Location") || "",
                BASE,
            );
            expect(callback.origin + callback.pathname).toBe(redirectUri);
            expect(callback.searchParams.get("code")).toBeTruthy();
            expect(callback.searchParams.has("error")).toBe(false);
        });
    }
}
