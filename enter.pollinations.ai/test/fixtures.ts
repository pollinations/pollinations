import { env, SELF } from "cloudflare:test";
import type { Logger } from "@logtape/logtape";
import { getLogger } from "@logtape/logtape";
import { signSessionToken } from "@shared/auth/session-token.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { ensureConfigured } from "@shared/logger.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";
import { drizzle } from "drizzle-orm/d1";
import { test as base, expect } from "vitest";
import { createMockDiscord } from "./mocks/discord.ts";
import { createMockGithub } from "./mocks/github.ts";
import { createMockStripe } from "./mocks/stripe.ts";

const createAuthClientInstance = () =>
    createAuthClient({
        baseURL: "http://localhost:3000",
        basePath: "/api/auth",
        plugins: [adminClient()],
        fetchOptions: {
            customFetchImpl: (input, init) => SELF.fetch(input, init),
        },
    });

const createMocks = () => ({
    tinybird: createMockTinybird(),
    discord: createMockDiscord(),
    github: createMockGithub(),
    stripe: createMockStripe(),
});

type Mocks = ReturnType<typeof createMocks>;

type Fixtures = {
    log: Logger;
    mocks: ReturnType<typeof createFetchMock<Mocks>>;
    auth: ReturnType<typeof createAuthClientInstance>;
    sessionToken: string;
    /** Dashboard session token for the account API, minted from the session cookie */
    accountToken: string;
    apiKey: string;
    /** API key for a user with pack balance (can use paidOnly models) */
    paidApiKey: string;
    pubApiKey: string;
    /** API key restricted to only ["openai/gpt-5-nano", "black-forest-labs/flux.1-schnell"] models */
    restrictedApiKey: string;
    /** API key with zero pollen budget (should be rejected with 402) */
    exhaustedBudgetApiKey: string;
    /** API key with 100 pollen budget for testing decrement */
    budgetedApiKey: { key: string; id: string };
};

type SignupData = {
    url: string;
};

/**
 * Creates an API key through the real POST /api/account/keys endpoint
 * (same flow as production) and returns the created key record.
 */
export const createApiKeyViaApi = async (
    accountToken: string,
    options: {
        name: string;
        type?: "secret" | "publishable";
        allowedModels?: string[];
        pollenBudget?: number | null;
        accountPermissions?: string[];
        questPollenOnly?: boolean;
    },
) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            },
            body: JSON.stringify(options),
        },
    );
    if (!response.ok) {
        throw new Error(`Failed to create API key: ${await response.text()}`);
    }
    return (await response.json()) as { id: string; key: string };
};

/** Mints the dashboard's short-lived account API token from a session cookie. */
export const mintAccountToken = async (sessionToken: string) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/session-token",
        {
            method: "POST",
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    if (!response.ok) {
        throw new Error(`Failed to mint session token: ${response.status}`);
    }
    return ((await response.json()) as { token: string }).token;
};

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
    // Signed directly: session-token.test.ts covers minting over HTTP.
    accountToken: async ({ sessionToken: _sessionToken }, use) => {
        // Each test has an isolated DB with exactly one user, signed in above.
        const user = await drizzle(env.DB)
            .select({ id: userTable.id })
            .from(userTable)
            .get();
        if (!user) throw new Error("Missing fixture user");
        await use(
            await signSessionToken({
                secret: env.BETTER_AUTH_SECRET,
                userId: user.id,
            }),
        );
    },
    apiKey: async ({ accountToken }, use) => {
        const created = await createApiKeyViaApi(accountToken, {
            name: "test-api-key",
        });
        await use(created.key);
    },
    /**
     * API key for a user with pack balance, enabling paidOnly model access.
     * Grants 100 pollen pack balance via direct DB update.
     */
    paidApiKey: async ({ accountToken }, use) => {
        // Each test has an isolated DB with exactly one user — update all users
        const db = drizzle(env.DB);
        await db.update(userTable).set({ packBalance: 100 });

        const created = await createApiKeyViaApi(accountToken, {
            name: "paid-test-api-key",
        });
        await use(created.key);
    },
    pubApiKey: async ({ accountToken }, use) => {
        const created = await createApiKeyViaApi(accountToken, {
            name: "test-api-key",
            type: "publishable",
        });
        const pubApiKey = created.key;
        expect(pubApiKey.startsWith("pk_")).toBe(true);
        await use(pubApiKey);
    },
    restrictedApiKey: async ({ accountToken }, use) => {
        const created = await createApiKeyViaApi(accountToken, {
            name: "restricted-test-key",
            allowedModels: [
                "openai/gpt-5-nano",
                "black-forest-labs/flux.1-schnell",
            ],
        });
        await use(created.key);
    },
    exhaustedBudgetApiKey: async ({ accountToken }, use) => {
        const created = await createApiKeyViaApi(accountToken, {
            name: "exhausted-budget-key",
            pollenBudget: 0,
        });
        await use(created.key);
    },
    budgetedApiKey: async ({ accountToken }, use) => {
        const { key, id } = await createApiKeyViaApi(accountToken, {
            name: "budgeted-test-key",
            pollenBudget: 100,
        });
        await use({ key, id });
    },
});
