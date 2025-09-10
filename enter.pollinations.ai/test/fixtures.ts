import { test as base, expect } from "vitest";
import { createAuthClient } from "better-auth/client";
import { apiKeyClient } from "better-auth/client/plugins";
import { adminClient } from "better-auth/client/plugins";
import { SELF } from "cloudflare:test";

const createAuth = () =>
    createAuthClient({
        baseURL: "http://localhost:3000",
        basePath: "/api/auth",
        plugins: [apiKeyClient(), adminClient()],
        fetchOptions: {
            customFetchImpl: (input, init) => SELF.fetch(input, init),
        },
    });

type Fixtures = {
    auth: ReturnType<typeof createAuth>;
    sessionToken: string;
    apiKey: string;
};

export const test = base.extend<Fixtures>({
    auth: async ({}, use) => {
        const auth = createAuth();
        use(auth);
    },
    sessionToken: async ({ auth }, use) => {
        const signInResponse = await auth.signIn.social({ provider: "github" });
        if (!signInResponse.data?.url) throw new Error("Sign-in failed");
        const forwardUrl = new URL(signInResponse.data.url);
        const state = forwardUrl.searchParams.get("state");
        if (!state) throw new Error("State param is missing");

        // complete OAuth callback
        const callbackUrl = new URL(
            "http://localhost:3000/api/auth/callback/github",
        );
        callbackUrl.searchParams.set("code", "test_code");
        callbackUrl.searchParams.set("state", state);

        const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
                "Accept": "text/html,application/xhtml+xml",
            },
            redirect: "manual",
        });
        expect(callbackResponse.status).toBe(302);
        await callbackResponse.text();

        // extract session cookie
        const setCookieHeader = callbackResponse.headers.get("Set-Cookie");
        expect(setCookieHeader).toBeTruthy();

        const sessionMatch = setCookieHeader?.match(
            /better-auth\.session_token=([^;]+)/,
        );
        expect(sessionMatch).toBeTruthy();
        const sessionToken = sessionMatch?.[1];

        if (!sessionToken) throw new Error("Failed to get session token");
        use(sessionToken);
    },
    apiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "testing",
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create API key");
        const apiKey = createApiKeyResponse.data.key;
        use(apiKey);
    },
});
