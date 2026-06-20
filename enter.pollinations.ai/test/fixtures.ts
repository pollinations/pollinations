import { env, SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { user as userTable } from "@shared/db/better-auth.ts";
import { ensureConfigured } from "@shared/logger.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { createAuthClient } from "better-auth/client";
import { adminClient, apiKeyClient } from "better-auth/client/plugins";
import { drizzle } from "drizzle-orm/d1";
import { test as base, expect } from "vitest";
import { createMockGithub } from "./mocks/github.ts";
import { createMockStripe } from "./mocks/stripe.ts";

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
    tinybird: createMockTinybird(),
    github: createMockGithub(),
    stripe: createMockStripe(),
});

type Mocks = ReturnType<typeof createMocks>;

type Fixtures = {
    log: Logger;
    mocks: ReturnType<typeof createFetchMock<Mocks>>;
    auth: ReturnType<typeof createAuthClientInstance>;
    sessionToken: string;
    apiKey: string;
    /** API key for a user with pack balance (can use paidOnly models) */
    paidApiKey: string;
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

type CreateApiKeyInput = {
    name: string;
    type?: "secret" | "publishable";
    expiresIn?: number;
    allowedModels?: string[] | null;
    pollenBudget?: number | null;
    accountPermissions?: string[] | null;
    metadata?: Record<string, unknown>;
};

type CreatedApiKey = {
    id: string;
    key: string;
    name?: string | null;
    metadata?: Record<string, unknown>;
    permissions?: Record<string, string[]> | null;
};

export async function createApiKeyViaApi(
    sessionToken: string,
    input: CreateApiKeyInput,
): Promise<CreatedApiKey> {
    const response = await SELF.fetch("http://localhost:3000/api/api-keys", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cookie": `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify(input),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
        throw new Error(
            `Failed to create API key (${response.status}): ${text}`,
        );
    }
    return data;
}

export const test = base.extend<Fixtures>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    log: async ({}, use) => {
        await ensureConfigured({ level: "trace" });
        await use(getLogger(["test"]));
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        const mocks = createFetchMock(createMocks(), { logRequests: true });
        await use(mocks);
        await teardownFetchMock();
    },
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    auth: async ({}, use) => {
        const auth = createAuthClientInstance();
        await use(auth);
    },
    sessionToken: async ({ mocks }, use) => {
        await mocks.enable("github", "tinybird");
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
    apiKey: async ({ sessionToken }, use) => {
        const created = await createApiKeyViaApi(sessionToken, {
            name: "test-api-key",
        });
        await use(created.key);
    },
    /**
     * API key for a user with pack balance, enabling paidOnly model access.
     * Grants 100 pollen pack balance via direct DB update.
     */
    paidApiKey: async ({ sessionToken }, use) => {
        // Each test has an isolated DB with exactly one user — update all users
        const db = drizzle(env.DB);
        await db.update(userTable).set({ packBalance: 100 });

        const created = await createApiKeyViaApi(sessionToken, {
            name: "paid-test-api-key",
        });
        await use(created.key);
    },
    pubApiKey: async ({ sessionToken }, use) => {
        const created = await createApiKeyViaApi(sessionToken, {
            name: "test-api-key",
            type: "publishable",
        });
        const pubApiKey = created.key;
        expect(pubApiKey.startsWith("pk_")).toBe(true);
        await use(pubApiKey);
    },
    /**
     * Creates an API key restricted to only ["openai-fast", "flux"] models.
     * Uses the /api/api-keys/:id/update endpoint to set permissions.
     */
    restrictedApiKey: async ({ sessionToken }, use) => {
        const created = await createApiKeyViaApi(sessionToken, {
            name: "restricted-test-key",
            allowedModels: ["openai-fast", "flux"],
        });

        await use(created.key);
    },
    /**
     * Creates an API key with zero pollen budget (exhausted).
     * Uses the /api/api-keys/:id/update endpoint to set pollenBudget to 0.
     */
    exhaustedBudgetApiKey: async ({ sessionToken }, use) => {
        const created = await createApiKeyViaApi(sessionToken, {
            name: "exhausted-budget-key",
            pollenBudget: 0,
        });

        await use(created.key);
    },
    /**
     * Creates an API key with 100 pollen budget for testing decrement.
     * Returns both key and id so tests can verify balance changes.
     */
    budgetedApiKey: async ({ sessionToken }, use) => {
        const created = await createApiKeyViaApi(sessionToken, {
            name: "budgeted-test-key",
            pollenBudget: 100,
        });

        await use({
            key: created.key,
            id: created.id,
        });
    },
});
