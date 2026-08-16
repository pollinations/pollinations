import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    agent as agentTable,
    apikey as apiKeyTable,
    communityEndpoint as communityEndpointTable,
    rewards as rewardsTable,
    session as sessionTable,
    stripeCheckoutCredits as stripeCheckoutCreditsTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import {
    mediaItem as mediaItemTable,
    mediaTag as mediaTagTable,
} from "@shared/db/media-catalog.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("POST /api/auth/delete-user", () => {
    test("minimizes the account, revokes access, and preserves reward protection", async ({
        apiKey,
        mocks,
        sessionToken,
    }) => {
        const db = drizzle(env.DB);
        const [user] = await db
            .select({ id: userTable.id, githubId: userTable.githubId })
            .from(userTable);
        if (!user) throw new Error("Expected test user");

        await db.insert(mediaItemTable).values({
            id: "test-media-item",
            ownerUserId: user.id,
            appKeyId: null,
            contentType: "image/png",
            size: 123,
            createdAt: new Date(),
        });
        await db.insert(mediaTagTable).values({
            itemId: "test-media-item",
            tag: "test",
        });
        await db.insert(agentTable).values({
            id: "test-agent",
            ownerUserId: user.id,
            config: JSON.stringify({ instructions: "Test" }),
        });
        await db.insert(communityEndpointTable).values({
            id: "test-community-model",
            ownerUserId: user.id,
            name: "test-model",
            agentId: "test-agent",
            upstreamModel: "openai-fast",
            promptTextPrice: 0,
            completionTextPrice: 0,
        });
        await db.insert(rewardsTable).values({
            id: "test-reward",
            idempotencyKey: `quest:first_api_key:user:${user.id}`,
            userId: user.id,
            questId: "first_api_key",
            title: "Create your first API key",
            pollenAmount: 0.25,
            balanceBucket: "tier",
            earnedAt: new Date(),
            claimedAt: new Date(),
        });
        await db.insert(stripeCheckoutCreditsTable).values({
            sessionId: "test-checkout",
            eventId: "test-checkout-event",
            eventType: "checkout.session.completed",
            userId: user.id,
            pollenCredited: 100,
            createdAt: new Date(),
        });

        const response = await SELF.fetch(
            "http://localhost:3000/api/auth/delete-user",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({}),
            },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            message: "User deleted",
        });

        const users = await db.select().from(userTable);
        expect(users).toHaveLength(1);
        expect(users[0]).toMatchObject({
            id: user.id,
            githubId: user.githubId,
            name: "Deleted account",
            emailVerified: false,
            image: null,
            banned: true,
            banReason: "account_deleted",
            banExpires: null,
            githubUsername: null,
            tierBalance: 0,
            packBalance: 0,
            stripeCustomerId: null,
            autoTopUpEnabled: false,
        });
        expect(users[0]?.email).toBe(`deleted-${user.id}@pollinations.invalid`);
        expect(await db.select().from(sessionTable)).toHaveLength(0);
        expect(await db.select().from(accountTable)).toHaveLength(0);
        expect(await db.select().from(apiKeyTable)).toHaveLength(0);
        expect(await db.select().from(agentTable)).toHaveLength(0);
        expect(await db.select().from(communityEndpointTable)).toHaveLength(0);
        expect(await db.select().from(mediaItemTable)).toHaveLength(0);
        expect(await db.select().from(mediaTagTable)).toHaveLength(0);
        expect(await db.select().from(rewardsTable)).toHaveLength(1);
        expect(await db.select().from(stripeCheckoutCreditsTable)).toHaveLength(
            1,
        );

        const keyResponse = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        expect(keyResponse.status).toBe(401);

        // A later sign-in with the same immutable GitHub identity must not
        // create a fresh Pollinations user and reopen per-user quest rewards.
        await mocks.enable("github", "tinybird");
        const signupResponse = await SELF.fetch(
            "http://localhost:3000/api/auth/sign-in/social",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: "github" }),
            },
        );
        expect(signupResponse.status).toBe(200);

        const signupData = (await signupResponse.json()) as { url: string };
        const signupCookies = signupResponse.headers.get("Set-Cookie");
        if (!signupCookies) throw new Error("Expected OAuth state cookie");
        const state = new URL(signupData.url).searchParams.get("state");
        if (!state) throw new Error("Expected OAuth state");

        const callbackUrl = new URL(
            "http://localhost:3000/api/auth/callback/github",
        );
        callbackUrl.searchParams.set("code", "test-code");
        callbackUrl.searchParams.set("state", state);
        const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
            headers: {
                Accept: "text/html,application/xhtml+xml",
                Cookie: signupCookies,
                "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            },
            redirect: "manual",
        });

        expect(callbackResponse.status).toBe(302);
        expect(callbackResponse.headers.get("Location")).toContain("error=");
        expect(callbackResponse.headers.get("Set-Cookie") ?? "").not.toContain(
            "better-auth.session_token=",
        );
        expect(await db.select().from(userTable)).toHaveLength(1);
    });
});
