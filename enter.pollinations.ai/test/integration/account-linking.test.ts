import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    rewards as rewardsTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { createAuth } from "../../src/auth.ts";
import {
    discordConfigFromEnv,
    isPollinationsDiscordMember,
} from "../../src/services/discord.ts";
import { checkQuestsForUser } from "../../src/services/quest-checker.ts";
import { test } from "../fixtures.ts";

async function seedDiscordAccount(accountId: string): Promise<string> {
    const db = drizzle(env.DB);
    const [user] = await db.select({ id: userTable.id }).from(userTable);
    if (!user) throw new Error("Expected fixture user");
    await db.insert(accountTable).values({
        id: crypto.randomUUID(),
        accountId,
        providerId: "discord",
        userId: user.id,
    });
    return user.id;
}

async function getDiscordReward(userId: string) {
    const db = drizzle(env.DB);
    const [reward] = await db
        .select({
            questId: rewardsTable.questId,
            pollenAmount: rewardsTable.pollenAmount,
        })
        .from(rewardsTable)
        .where(
            and(
                eq(rewardsTable.userId, userId),
                eq(rewardsTable.questId, "join_discord"),
            ),
        );
    return reward ?? null;
}

test("requires complete Discord configuration", () => {
    expect(
        discordConfigFromEnv({
            DISCORD_CLIENT_ID: "client-id",
            DISCORD_CLIENT_SECRET: "client-secret",
        }),
    ).toBeNull();
    expect(
        discordConfigFromEnv({
            DISCORD_CLIENT_ID: "client-id",
            DISCORD_CLIENT_SECRET: "client-secret",
            DISCORD_BOT_TOKEN: "bot-token",
        }),
    ).not.toBeNull();

    const auth = createAuth({
        ...env,
        DISCORD_BOT_TOKEN: "",
    } as unknown as Cloudflare.Env);
    expect(auth.options.socialProviders).not.toHaveProperty("discord");
});

test("links a Discord identity to the signed-in GitHub account", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("discord");

    const linkResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/link-social",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                provider: "discord",
                callbackURL: "/account",
            }),
        },
    );
    expect(linkResponse.status).toBe(200);

    const { url } = (await linkResponse.json()) as { url: string };
    const authorizationUrl = new URL(url);
    const state = authorizationUrl.searchParams.get("state");
    expect(
        authorizationUrl.searchParams.get("scope")?.split(" "),
    ).not.toContain("guilds.members.read");
    const stateCookie = linkResponse.headers.get("Set-Cookie");
    if (!state || !stateCookie) throw new Error("Expected Discord OAuth state");

    const callbackUrl = new URL(
        "http://localhost:3000/api/auth/callback/discord",
    );
    callbackUrl.searchParams.set("code", "discord-test-code");
    callbackUrl.searchParams.set("state", state);

    const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
        headers: {
            Accept: "text/html,application/xhtml+xml",
            Cookie: `better-auth.session_token=${sessionToken}; ${stateCookie}`,
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
        },
        redirect: "manual",
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("Location")).toBe("/account");

    const db = drizzle(env.DB);
    const [user] = await db.select({ id: userTable.id }).from(userTable);
    if (!user) throw new Error("Expected fixture user");
    const discordAccount = (await db.select().from(accountTable)).find(
        (account) => account.providerId === "discord",
    );

    expect(discordAccount).toMatchObject({
        accountId: mocks.discord.state.userId,
        userId: user?.id,
    });
    expect(discordAccount?.accessToken).toBe("mock_discord_access_token");
    expect(discordAccount?.refreshToken).toBe("mock_discord_refresh_token");

    const secondLinkResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/link-social",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                provider: "discord",
                callbackURL: "/account",
            }),
        },
    );
    expect(secondLinkResponse.status).toBe(400);
    await expect(secondLinkResponse.json()).resolves.toMatchObject({
        code: "DISCORD_ACCOUNT_ALREADY_CONNECTED",
    });
    const discordAccounts = await db
        .select()
        .from(accountTable)
        .where(
            and(
                eq(accountTable.userId, user.id),
                eq(accountTable.providerId, "discord"),
            ),
        );
    expect(discordAccounts).toHaveLength(1);

    const accountInfoResponse = await SELF.fetch(
        `http://localhost:3000/api/auth/account-info?accountId=${discordAccount?.accountId}`,
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(accountInfoResponse.status).toBe(200);
    await expect(accountInfoResponse.json()).resolves.toMatchObject({
        data: { username: "discord-test-user" },
        user: {
            id: mocks.discord.state.userId,
            name: "Discord Test User",
        },
    });

    await checkQuestsForUser(env, user.id);
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
    await checkQuestsForUser(env, user.id);
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
    await expect(getDiscordReward(user.id)).resolves.toEqual({
        questId: "join_discord",
        pollenAmount: 1,
    });
});

test("treats Discord error 10007 as a missing member", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("discord");
    const userId = await seedDiscordAccount(mocks.discord.state.userId);
    mocks.discord.state.membershipStatus = 404;
    mocks.discord.state.membershipErrorCode = 10007;

    await expect(isPollinationsDiscordMember(env, userId)).resolves.toBe(false);
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
});

test("surfaces Discord 404 errors other than unknown member", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("discord");
    const userId = await seedDiscordAccount(mocks.discord.state.userId);
    mocks.discord.state.membershipStatus = 404;
    mocks.discord.state.membershipErrorCode = 10004;

    await expect(isPollinationsDiscordMember(env, userId)).rejects.toThrow(
        "404 code=10004",
    );
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
});

test("surfaces Discord membership rate limits", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("discord");
    const userId = await seedDiscordAccount(mocks.discord.state.userId);
    mocks.discord.state.membershipStatus = 429;

    await expect(isPollinationsDiscordMember(env, userId)).rejects.toThrow(
        "Discord membership lookup is rate limited",
    );
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
});

test("rejects Discord as a standalone sign-in provider", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "discord" }),
        },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
        message:
            "Discord can only be connected to an existing Pollinations account.",
    });
});
