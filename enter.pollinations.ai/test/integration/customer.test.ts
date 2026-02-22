import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { test } from "../fixtures.ts";

const base = "http://localhost:3000/api/customer";
const routes = ["/balance"];

test.for(
    routes,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const anonymousResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
    });
    expect(anonymousResponse.status).toBe(401);
    const sessionCookieResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        redirect: "manual",
    });

    // Customer balance route should return 200 with valid session
    expect(sessionCookieResponse.status).toBe(200);
});

test("/balance should return all balance types and lastTierGrant", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);

    // Get the authenticated user ID from session
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const session = await sessionResponse.json();
    const userId = session.user.id;

    // Set up test balances for the user
    const testBalances = {
        tierBalance: 10.5,
        packBalance: 25.3,
        cryptoBalance: 5.0,
    };
    const lastTierGrant = Date.now() - 3600000; // 1 hour ago

    await db
        .update(userTable)
        .set({
            ...testBalances,
            lastTierGrant,
        })
        .where(eq(userTable.id, userId));

    // Fetch balance via customer endpoint
    const response = await SELF.fetch(`${base}/balance`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify all balance fields are returned correctly
    expect(data).toEqual({
        tierBalance: testBalances.tierBalance,
        packBalance: testBalances.packBalance,
        cryptoBalance: testBalances.cryptoBalance,
        lastTierGrant,
    });
});

test("/balance should return zero balances for new users", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const db = drizzle(env.DB);

    // Get the authenticated user ID from session
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const session = await sessionResponse.json();
    const userId = session.user.id;

    // Reset all balances to 0
    await db
        .update(userTable)
        .set({
            tierBalance: 0,
            packBalance: 0,
            cryptoBalance: 0,
            lastTierGrant: null,
        })
        .where(eq(userTable.id, userId));

    const response = await SELF.fetch(`${base}/balance`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
        tierBalance: 0,
        packBalance: 0,
        cryptoBalance: 0,
        lastTierGrant: null,
    });
});

test("/balance should reject API key authentication", async ({ mocks }) => {
    await mocks.enable("polar", "tinybird");

    // Try to access with API key instead of session
    const response = await SELF.fetch(`${base}/balance`, {
        method: "GET",
        headers: {
            authorization: "Bearer sk_test123",
        },
    });

    // Should require session cookie, not API key
    expect(response.status).toBe(401);
});
