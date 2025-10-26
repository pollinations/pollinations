import { test as base, expect } from "vitest";
import { createAuthClient } from "better-auth/client";
import { apiKeyClient, adminClient } from "better-auth/client/plugins";
import { SELF } from "cloudflare:test";
import { createMockPolar } from "./mocks/polar.ts";
import { createMockGithub } from "./mocks/github.ts";
import { createMockTinybird } from "./mocks/tinybird.ts";
import { teardownFetchMock, setupFetchMock } from "./mocks/fetch.ts";

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
    mocks: {
        github: ReturnType<typeof createMockGithub>;
        polar: ReturnType<typeof createMockPolar>;
        tinybird: ReturnType<typeof createMockTinybird>;
    };
    auth: ReturnType<typeof createAuth>;
    sessionToken: string;
    apiKey: string;
};

type SignupData = {
    url: string;
};

export const test = base.extend<Fixtures>({
    mocks: async ({}, use) => {
        const mockPolar = createMockPolar();
        const mockTinybird = createMockTinybird();
        const mockGithub = createMockGithub();
        const mockHandlers = {
            ...mockGithub.handlerMap,
            ...mockPolar.handlerMap,
            ...mockTinybird.handlerMap,
        };
        setupFetchMock(mockHandlers, { logRequests: true });
        await use({
            github: mockGithub,
            polar: mockPolar,
            tinybird: mockTinybird,
        });
        teardownFetchMock();
    },
    auth: async ({}, use) => {
        const auth = createAuth();
        use(auth);
    },
    sessionToken: async ({ mocks: _ }, use) => {
        const signupUrl = new URL(
            "http://localhost:3000/api/auth/sign-in/social",
        );

        const signupResponse = await SELF.fetch(signupUrl.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                provider: "github",
            }),
        });

        expect(signupResponse.status).toBe(200);
        const signupData = (await signupResponse.json()) as SignupData;

        const signupCookies = signupResponse.headers.get("Set-Cookie");
        if (!signupCookies) throw new Error("Set-Cookie header is missing");

        const forwardUrl = new URL(signupData.url);
        const state = forwardUrl.searchParams.get("state");
        if (!state) throw new Error("State param is missing");

        // complete OAuth callback
        const callbackUrl = new URL(
            "http://localhost:3000/api/auth/callback/github",
        );
        callbackUrl.searchParams.set("code", "test-code");
        callbackUrl.searchParams.set("state", state);

        const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
                "Accept": "text/html,application/xhtml+xml",
                "Cookie": signupCookies,
            },
            redirect: "manual",
        });
        expect(callbackResponse.status).toBe(302);

        // extract session cookie
        const setCookieHeader = callbackResponse.headers.get("Set-Cookie");
        expect(setCookieHeader).toBeTruthy();

        const sessionMatch = setCookieHeader?.match(
            /better-auth\.session_token=([^;]+)/,
        );
        expect(sessionMatch).toBeTruthy();
        const sessionToken = sessionMatch?.[1];

        if (!sessionToken) throw new Error("Failed to get session token");
        await use(sessionToken);
    },
    apiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "test-api-key",
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create API key");
        const apiKey = createApiKeyResponse.data.key;
        await use(apiKey);
    },
});
