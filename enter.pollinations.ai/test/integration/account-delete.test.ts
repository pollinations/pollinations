import { env, SELF } from "cloudflare:test";
import { recordRewards } from "@shared/billing/rewards.ts";
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
    test("deletes the account while preserving GitHub-scoped reward protection", async ({
        apiKey,
        mocks,
        sessionToken,
    }) => {
        const db = drizzle(env.DB);
        const [user] = await db
            .select({ id: userTable.id, githubId: userTable.githubId })
            .from(userTable);
        if (!user) throw new Error("Expected test user");
        if (user.githubId === null) throw new Error("Expected GitHub identity");

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
            idempotencyKey: `quest:first_api_key:github:${user.githubId}`,
            githubId: user.githubId,
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

        expect(await db.select().from(userTable)).toHaveLength(0);
        expect(await db.select().from(sessionTable)).toHaveLength(0);
        expect(await db.select().from(accountTable)).toHaveLength(0);
        expect(await db.select().from(apiKeyTable)).toHaveLength(0);
        expect(await db.select().from(agentTable)).toHaveLength(0);
        expect(await db.select().from(communityEndpointTable)).toHaveLength(0);
        expect(await db.select().from(mediaItemTable)).toHaveLength(0);
        expect(await db.select().from(mediaTagTable)).toHaveLength(0);
        expect(await db.select().from(stripeCheckoutCreditsTable)).toHaveLength(
            0,
        );

        const retainedRewards = await db.select().from(rewardsTable);
        expect(retainedRewards).toHaveLength(1);
        expect(retainedRewards[0]).toMatchObject({
            id: "test-reward",
            githubId: user.githubId,
            userId: null,
            idempotencyKey: `quest:first_api_key:github:${user.githubId}`,
        });

        const keyResponse = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${apiKey}` } },
        );
        expect(keyResponse.status).toBe(401);

        // A later sign-in with the same GitHub identity creates a fresh account,
        // but the retained idempotency key prevents the quest from paying twice.
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
        expect(callbackResponse.headers.get("Location") ?? "").not.toContain(
            "error=",
        );
        const replacementCookies =
            callbackResponse.headers.get("Set-Cookie") ?? "";
        expect(replacementCookies).toContain("better-auth.session_token=");

        const replacementUsers = await db.select().from(userTable);
        expect(replacementUsers).toHaveLength(1);
        const replacementUser = replacementUsers[0];
        if (!replacementUser) throw new Error("Expected replacement user");
        expect(replacementUser.id).not.toBe(user.id);
        expect(replacementUser.githubId).toBe(user.githubId);

        const duplicate = await recordRewards(db, [
            {
                idempotencyKey: `quest:first_api_key:github:${user.githubId}`,
                githubId: user.githubId,
                userId: replacementUser.id,
                questId: "first_api_key",
                title: "Create your first API key",
                amount: 0.25,
                bucket: "tier",
            },
        ]);
        expect(duplicate.recorded).toBe(0);
        expect(await db.select().from(rewardsTable)).toHaveLength(1);

        const replacementSessionToken = replacementCookies.match(
            /better-auth\.session_token=([^;]+)/,
        )?.[1];
        if (!replacementSessionToken) {
            throw new Error("Expected replacement session token");
        }

        const questStatusResponse = await SELF.fetch(
            "http://localhost:3000/api/account/quests",
            {
                headers: {
                    Cookie: `better-auth.session_token=${replacementSessionToken}`,
                },
            },
        );
        expect(questStatusResponse.status).toBe(200);
        const questStatus = (await questStatusResponse.json()) as {
            quests: Array<{
                id: string;
                status: string;
                reward: unknown;
            }>;
        };
        expect(
            questStatus.quests.find((quest) => quest.id === "first_api_key"),
        ).toMatchObject({ status: "completed", reward: null });
    });

    test("requires a session created within the last ten minutes", async ({
        sessionToken,
    }) => {
        const db = drizzle(env.DB);
        await db
            .update(sessionTable)
            .set({ createdAt: new Date(Date.now() - 11 * 60 * 1000) });

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

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            code: "SESSION_EXPIRED",
        });
        expect(await db.select().from(userTable)).toHaveLength(1);
    });
});
