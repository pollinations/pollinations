import { SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { createAuthClient } from "better-auth/client";
import { adminClient, apiKeyClient } from "better-auth/client/plugins";
import { test as base, expect } from "vitest";
import { ensureConfigured } from "@/logger.ts";
import { createFetchMock, teardownFetchMock } from "./mocks/fetch.ts";
import { createMockGithub } from "./mocks/github.ts";
import { createMockPolar } from "./mocks/polar.ts";
import { createMockTinybird } from "./mocks/tinybird.ts";
import { createMockVcr } from "./mocks/vcr.ts";

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
    /** API key with zero pollen budget (should be rejected with 402) */
    exhaustedBudgetApiKey: string;
    /** API key with 100 pollen budget for testing decrement */
    budgetedApiKey: { key: string; id: string };
};

type SignupData = {
    url: string;
};

export const test = base.extend<Fixtures>({
    log: async (_, use) => {
        await ensureConfigured({ level: "trace" });
        await use(getLogger(["test"]));
    },
    mocks: async (_, use) => {
        const mocks = createFetchMock(createMocks(), { logRequests: true });
        await use(mocks);
        await teardownFetchMock();
    },
    auth: async (_, use) => {
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
     * Uses the /api/api-keys/:id/update endpoint to set permissions.
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

        // Update permissions via the API endpoint (same flow as production)
        const updateResponse = await SELF.fetch(
            `http://localhost:3000/api/api-keys/${createApiKeyResponse.data.id}/update`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    allowedModels: ["openai-fast", "flux"],
                }),
            },
        );
        if (!updateResponse.ok) {
            throw new Error(
                `Failed to set API key permissions: ${await updateResponse.text()}`,
            );
        }

        await use(createApiKeyResponse.data.key);
    },
    /**
     * Creates an API key with zero pollen budget (exhausted).
     * Uses the /api/api-keys/:id/update endpoint to set pollenBudget to 0.
     */
    exhaustedBudgetApiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "exhausted-budget-key",
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create exhausted budget API key");

        // Set pollenBudget to 0 via the API endpoint
        const updateResponse = await SELF.fetch(
            `http://localhost:3000/api/api-keys/${createApiKeyResponse.data.id}/update`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    pollenBudget: 0,
                }),
            },
        );
        if (!updateResponse.ok) {
            throw new Error(
                `Failed to set API key budget: ${await updateResponse.text()}`,
            );
        }

        await use(createApiKeyResponse.data.key);
    },
    /**
     * Creates an API key with 100 pollen budget for testing decrement.
     * Returns both key and id so tests can verify balance changes.
     */
    budgetedApiKey: async ({ auth, sessionToken }, use) => {
        const createApiKeyResponse = await auth.apiKey.create({
            name: "budgeted-test-key",
            fetchOptions: {
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createApiKeyResponse.data)
            throw new Error("Failed to create budgeted API key");

        // Set pollenBudget to 100 via the API endpoint
        const updateResponse = await SELF.fetch(
            `http://localhost:3000/api/api-keys/${createApiKeyResponse.data.id}/update`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    pollenBudget: 100,
                }),
            },
        );
        if (!updateResponse.ok) {
            throw new Error(
                `Failed to set API key budget: ${await updateResponse.text()}`,
            );
        }

        await use({
            key: createApiKeyResponse.data.key,
            id: createApiKeyResponse.data.id,
        });
    },
});
