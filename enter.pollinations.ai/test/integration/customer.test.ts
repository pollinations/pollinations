import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

const base = "http://localhost:3000/api/customer";
const routes = ["/balance"];

test.for(
    routes,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
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

test("/balance should return tier, pack, and lastTierGrant", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
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
    };
    const lastTierGrant = Date.now() - 3600000; // 1 hour ago

    await db
        .update(userTable)
        .set({
            ...testBalances,
            tier: "seed",
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
        lastTierGrant,
    });
});

test("/balance should return raw tier and pack balances regardless of tier", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const db = drizzle(env.DB);

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

    const tiers = ["microbe", "spore", "seed", "flower", "nectar", "router"];

    for (const tier of tiers) {
        await db
            .update(userTable)
            .set({
                tier,
                tierBalance: 1,
                packBalance: 3,
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
        expect(await response.json()).toEqual({
            tierBalance: 1,
            packBalance: 3,
            lastTierGrant: null,
        });
    }
});

test("/balance should return zero balances for new users", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
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
        lastTierGrant: null,
    });
});

test("/balance should reject API key authentication", async ({ mocks }) => {
    await mocks.enable("tinybird");

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
