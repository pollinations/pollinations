import { test as base, expect } from "vitest";
import { createAuthClient } from "better-auth/client";
import { apiKeyClient, adminClient } from "better-auth/client/plugins";
import { SELF, env } from "cloudflare:test";
import { createMockPolar } from "./mocks/polar.ts";
import { createMockGithub } from "./mocks/github.ts";
import { createMockTinybird } from "./mocks/tinybird.ts";
import { teardownFetchMock, createFetchMock } from "./mocks/fetch.ts";
import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { ensureConfigured } from "@/logger.ts";
import { createMockVcr } from "./mocks/vcr.ts";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema/better-auth.ts";
import { eq } from "drizzle-orm";

const createAuthClientInstance = () =>
    createAuthClient({
        baseURL: "http://localhost:3000",
        basePath: "/api/auth",
        plugins: [apiKeyClient(), adminClient()],
        fetchOptions: {
            customFetchImpl: (input, init) => SELF.fetch(input, init),
        },
    });

const createMocks = () => ({
    polar: createMockPolar(),
    tinybird: createMockTinybird(),
    github: createMockGithub(),
    vcr: createMockVcr(globalThis.fetch),
});

type Mocks = ReturnType<typeof createMocks>;

type Fixtures = {
    log: Logger;
    mocks: ReturnType<typeof createFetchMock<Mocks>>;
    auth: ReturnType<typeof createAuthClientInstance>;
    sessionToken: string;
    apiKey: string;
    pubApiKey: string;
    /** API key restricted to only ["openai-fast", "flux"] models */
    restrictedApiKey: string;
};

type SignupData = {
    url: string;
};

export const test = base.extend<Fixtures>({
    log: async ({/* empty */}, use) => {
        await ensureConfigured("trace");
        await use(getLogger(["test"]));
    },
    mocks: async ({/* empty */}, use) => {
        const mocks = createFetchMock(createMocks(), { logRequests: true });
        await use(mocks);
        await teardownFetchMock();
    },
    auth: async ({/* empty */}, use) => {
        const auth = createAuthClientInstance();
        await use(auth);
    },
    sessionToken: async ({ mocks }, use) => {
        await mocks.enable("github", "polar", "tinybird");
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
        mocks.clear();
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
            throw new Error("Failed to create secret API key");
        const apiKey = createApiKeyResponse.data.key;
        // expect(apiKey.startsWith("sk_")).toBe(true);
        await use(apiKey);
    },
    pubApiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "test-api-key",
            prefix: "pk",
            metadata: { keyType: "publishable" },
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create publishable API key");
        const pubApiKey = createApiKeyResponse.data.key;
        expect(pubApiKey.startsWith("pk_")).toBe(true);
        await use(pubApiKey);
    },
    /**
     * Creates an API key restricted to only ["openai-fast", "flux"] models.
     * Uses direct DB access for permissions (same as production endpoint).
     */
    restrictedApiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "restricted-test-key",
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create restricted API key");

        // Update permissions directly in DB (better-auth's permissions is server-only)
        const db = drizzle(env.DB, { schema });
        await db
            .update(schema.apikey)
            .set({
                permissions: JSON.stringify({
                    models: ["openai-fast", "flux"],
                }),
            })
            .where(eq(schema.apikey.id, createApiKeyResponse.data.id));

        await use(createApiKeyResponse.data.key);
    },
});
