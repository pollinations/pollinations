import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const baseUrl = "http://localhost:3000/api";

test("admin grant records one claimable reward per user and campaign", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const [user] = await db
        .select({
            id: schema.user.id,
            githubUsername: schema.user.githubUsername,
        })
        .from(schema.user)
        .limit(1);
    expect(user?.githubUsername).toBeTruthy();

    const request = {
        campaignId: "unmerged-pr-thanks-2026-08",
        title: "Thanks for contributing",
        pollenAmount: 3,
        sourceUrl: "https://github.com/pollinations/pollinations/issues/12583",
        githubUsernames: [
            user?.githubUsername?.toUpperCase() ?? "",
            user?.githubUsername ?? "",
            "missing-user",
        ],
    };
    const grant = await SELF.fetch(`${baseUrl}/admin/quest-grants`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });
    expect(grant.status).toBe(200);
    expect(await grant.json()).toEqual({
        campaignId: request.campaignId,
        balanceBucket: "tier",
        matched: 1,
        recorded: 1,
        missing: ["missing-user"],
    });

    const retry = await SELF.fetch(`${baseUrl}/admin/quest-grants`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ recorded: 0 });

    const [reward] = await db
        .select()
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "grant:unmerged-pr-thanks-2026-08"));
    expect(reward).toMatchObject({
        userId: user?.id,
        title: request.title,
        pollenAmount: 3,
        balanceBucket: "tier",
        url: request.sourceUrl,
        claimedAt: null,
    });

    const listed = await SELF.fetch(`${baseUrl}/quests/rewards`, {
        headers: {
            Cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
        rewards: [
            {
                id: reward?.id,
                questId: "grant:unmerged-pr-thanks-2026-08",
                url: request.sourceUrl,
                claimedAt: null,
            },
        ],
    });
});

test("a pack grant credits paid pollen when claimed", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const [user] = await db
        .select({
            id: schema.user.id,
            githubUsername: schema.user.githubUsername,
            packBalance: schema.user.packBalance,
        })
        .from(schema.user)
        .limit(1);

    const grant = await SELF.fetch(`${baseUrl}/admin/quest-grants`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            campaignId: "paid-bonus-2026-08",
            title: "Paid pollen bonus",
            pollenAmount: 5,
            balanceBucket: "pack",
            githubUsernames: [user?.githubUsername ?? ""],
        }),
    });
    expect(grant.status).toBe(200);
    expect(await grant.json()).toMatchObject({
        balanceBucket: "pack",
        recorded: 1,
    });

    const [reward] = await db
        .select()
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "grant:paid-bonus-2026-08"));
    expect(reward).toMatchObject({ balanceBucket: "pack", claimedAt: null });

    const claim = await SELF.fetch(
        `${baseUrl}/quests/rewards/${reward?.id}/claim`,
        {
            method: "POST",
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({
        claimed: true,
        newBalance: (user?.packBalance ?? 0) + 5,
    });

    const [credited] = await db
        .select({
            tierBalance: schema.user.tierBalance,
            packBalance: schema.user.packBalance,
        })
        .from(schema.user)
        .where(eq(schema.user.id, user?.id ?? ""));
    expect(credited?.packBalance).toBe((user?.packBalance ?? 0) + 5);
});

test("admin grant rejects requests without the admin token", async () => {
    const response = await SELF.fetch(`${baseUrl}/admin/quest-grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
});
