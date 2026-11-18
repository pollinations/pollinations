import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    rewards as rewardsTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { createAuth } from "../../src/auth.ts";
import {
    discordConfigFromEnv,
    getPollinationsDiscordMember,
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

async function finishOAuth(
    start: Response,
    provider: string,
    sessionCookie?: string,
): Promise<Response> {
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get("state");
    const stateCookie = start.headers.get("Set-Cookie");
    if (!state || !stateCookie) throw new Error("Expected OAuth state");
    const callbackUrl = new URL(
        `http://localhost:3000/api/auth/callback/${provider}`,
    );
    callbackUrl.searchParams.set("code", "test-code");
    callbackUrl.searchParams.set("state", state);
    return SELF.fetch(callbackUrl.toString(), {
        headers: {
            Accept: "text/html,application/xhtml+xml",
            Cookie: [sessionCookie, stateCookie].filter(Boolean).join("; "),
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
        },
        redirect: "manual",
    });
}

async function signIn(provider: "github" | "google"): Promise<Response> {
    const start = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, callbackURL: "/" }),
        },
    );
    expect(start.status).toBe(200);
    return finishOAuth(start, provider);
}

function sessionCookieFrom(response: Response): string {
    const token = response.headers
        .get("Set-Cookie")
        ?.match(/better-auth\.session_token=([^;]+)/)?.[1];
    if (!token) throw new Error("Expected session cookie");
    return `better-auth.session_token=${token}`;
}

function postWithSession(
    sessionCookie: string,
    path: string,
    body: object,
): Promise<Response> {
    return SELF.fetch(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: "http://localhost:3000",
        },
        body: JSON.stringify(body),
    });
}

function startGitHubLink(sessionCookie: string): Promise<Response> {
    return postWithSession(sessionCookie, "/link-social", {
        provider: "github",
        callbackURL: "/account",
    });
}

async function providersByEmail(email: string) {
    const db = drizzle(env.DB);
    return db
        .select({ userId: userTable.id, providerId: accountTable.providerId })
        .from(userTable)
        .innerJoin(accountTable, eq(accountTable.userId, userTable.id))
        .where(eq(userTable.email, email))
        .orderBy(accountTable.providerId);
}

test("signs up with Google without a GitHub identity", async ({ mocks }) => {
    await mocks.enable("google", "tinybird");

    const callback = await signIn("google");
    expect(callback.status).toBe(302);
    expect(callback.headers.get("Location")).toBe("/");

    const [user] = await drizzle(env.DB).select().from(userTable);
    expect(user).toMatchObject({
        email: "test@example.com",
        emailVerified: true,
        githubId: null,
        githubUsername: null,
    });
    expect(await providersByEmail("test@example.com")).toEqual([
        { userId: user?.id, providerId: "google" },
    ]);
});

test("Google opens the GitHub account with the same verified email", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("google", "tinybird");

    const callback = await signIn("google");
    expect(callback.headers.get("Location")).toBe("/");

    const accounts = await providersByEmail("test@example.com");
    expect(accounts.map((account) => account.providerId)).toEqual([
        "github",
        "google",
    ]);
    expect(new Set(accounts.map((account) => account.userId)).size).toBe(1);
});

test("Google never links on an unverified email", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("google", "tinybird");

    // Google has not verified the address.
    mocks.google.state.user.emailVerified = false;
    const unverifiedGoogle = await signIn("google");
    expect(unverifiedGoogle.headers.get("Location")).toContain(
        "error=account_not_linked",
    );

    // Our account has not verified it.
    mocks.google.state.user.emailVerified = true;
    await drizzle(env.DB).update(userTable).set({ emailVerified: false });
    const unverifiedLocal = await signIn("google");
    expect(unverifiedLocal.headers.get("Location")).toContain(
        "error=account_not_linked",
    );

    expect(
        (await providersByEmail("test@example.com")).map(
            (account) => account.providerId,
        ),
    ).toEqual(["github"]);
});

test("connects one GitHub account to a Google account", async ({ mocks }) => {
    await mocks.enable("google", "github", "tinybird");
    mocks.google.state.user.email = "google-user@example.com";
    const sessionCookie = sessionCookieFrom(await signIn("google"));

    const callback = await finishOAuth(
        await startGitHubLink(sessionCookie),
        "github",
        sessionCookie,
    );
    expect(callback.headers.get("Location")).toBe("/account");

    const [user] = await drizzle(env.DB).select().from(userTable);
    expect(user).toMatchObject({
        email: "google-user@example.com",
        githubId: mocks.github.state.user.id,
        githubUsername: mocks.github.state.user.login,
    });

    const secondLink = await startGitHubLink(sessionCookie);
    expect(secondLink.status).toBe(400);
    await expect(secondLink.json()).resolves.toMatchObject({
        code: "GITHUB_ACCOUNT_ALREADY_CONNECTED",
    });

    const secondGoogle = await postWithSession(sessionCookie, "/link-social", {
        provider: "google",
        callbackURL: "/account",
    });
    expect(secondGoogle.status).toBe(400);
    await expect(secondGoogle.json()).resolves.toMatchObject({
        code: "GOOGLE_ACCOUNT_ALREADY_CONNECTED",
    });

    const unlink = await postWithSession(sessionCookie, "/unlink-account", {
        providerId: "github",
    });
    expect(unlink.status).toBe(400);
    await expect(unlink.json()).resolves.toMatchObject({
        code: "GITHUB_ACCOUNT_CANNOT_BE_DISCONNECTED",
    });
    expect(
        (await providersByEmail("google-user@example.com")).map(
            (account) => account.providerId,
        ),
    ).toEqual(["github", "google"]);

    // A Google signup that later connected GitHub, for conversion analysis.
    const events = mocks.tinybird.state.productEvents
        .filter((row) =>
            ["signup_completed", "link_started", "link_completed"].includes(
                String(row.event),
            ),
        )
        .map((row) => [row.event, row.provider, row.user_id]);
    expect(events).toEqual([
        ["signup_completed", "google", user?.id],
        ["link_started", "github", user?.id],
        ["link_completed", "github", user?.id],
    ]);
});

test("GitHub opens the Google account with the same verified email", async ({
    mocks,
}) => {
    await mocks.enable("google", "github", "tinybird");
    await signIn("google");

    const callback = await signIn("github");
    expect(callback.headers.get("Location")).toBe("/");
    // Joining by email at sign-in is not a connect.
    expect(
        mocks.tinybird.state.productEvents.filter((row) =>
            String(row.event).startsWith("link_"),
        ),
    ).toEqual([]);

    const users = await drizzle(env.DB).select().from(userTable);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
        githubId: mocks.github.state.user.id,
        githubUsername: mocks.github.state.user.login,
    });
    expect(
        (await providersByEmail("test@example.com")).map(
            (account) => account.providerId,
        ),
    ).toEqual(["github", "google"]);
});

test("never joins a second GitHub account on sign-in", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("github", "tinybird");
    const firstGithubId = mocks.github.state.user.id;
    mocks.github.state.user.id = firstGithubId + 1;
    mocks.github.state.user.login = "second-github";

    const callback = await signIn("github");
    expect(callback.headers.get("Location")).toContain(
        "error=unable_to_link_account",
    );

    const [user] = await drizzle(env.DB).select().from(userTable);
    expect(user?.githubId).toBe(firstGithubId);
    expect(await providersByEmail("test@example.com")).toMatchObject([
        { providerId: "github" },
    ]);
});

test("refuses a GitHub account that belongs to another user", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("google", "github", "tinybird");
    mocks.google.state.user.email = "google-user@example.com";
    const sessionCookie = sessionCookieFrom(await signIn("google"));

    const callback = await finishOAuth(
        await startGitHubLink(sessionCookie),
        "github",
        sessionCookie,
    );
    expect(callback.headers.get("Location")).toContain(
        "error=account_already_linked_to_different_user",
    );
    expect(await providersByEmail("google-user@example.com")).toMatchObject([
        { providerId: "google" },
    ]);
});

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

test("checks staging access against the verified GitHub profile", () => {
    const auth = createAuth({
        ...env,
        ENVIRONMENT: "staging",
        STAGING_ALLOWED_GITHUB_IDS: "12345",
        STAGING_ALLOWED_EMAILS: "",
    } as unknown as Cloudflare.Env);
    const mapProfile = auth.options.socialProviders?.github?.mapProfileToUser;
    if (!mapProfile) throw new Error("Expected GitHub profile mapper");

    expect(
        mapProfile({ id: "12345", login: "allowed", email: null } as never),
    ).toEqual({});
    expect(() =>
        mapProfile({ id: "99999", login: "denied", email: null } as never),
    ).toThrow("staging is invite-only");
});

test("checks staging access against the Google email", () => {
    const auth = createAuth({
        ...env,
        ENVIRONMENT: "staging",
        STAGING_ALLOWED_GITHUB_IDS: "",
        STAGING_ALLOWED_EMAILS: "allowed@example.com",
    } as unknown as Cloudflare.Env);
    const mapProfile = auth.options.socialProviders?.google?.mapProfileToUser;
    if (!mapProfile) throw new Error("Expected Google profile mapper");

    expect(mapProfile({ email: "allowed@example.com" } as never)).toEqual({});
    expect(() => mapProfile({ email: "denied@example.com" } as never)).toThrow(
        "staging is invite-only",
    );
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
                Origin: "http://localhost:3000",
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
                Origin: "http://localhost:3000",
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

    await expect(getPollinationsDiscordMember(env, userId)).resolves.toBeNull();
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

    await expect(getPollinationsDiscordMember(env, userId)).rejects.toThrow(
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

    await expect(getPollinationsDiscordMember(env, userId)).rejects.toThrow(
        "Discord membership lookup is rate limited",
    );
    expect(mocks.discord.state.membershipRequestCount).toBe(1);
});

test("pays Discord quests once per Discord account", async ({
    mocks,
    sessionToken: _sessionToken,
}) => {
    await mocks.enable("discord");
    const discordId = mocks.discord.state.userId;
    const firstUserId = await seedDiscordAccount(discordId);
    // Arcane's "Level 20+" role and Discord's Server Booster role.
    mocks.discord.state.memberRoles = [
        "1365603135858409482",
        "1110978276433866842",
    ];

    await checkQuestsForUser(env, firstUserId);

    // Move the same Discord account to a second Pollinations account.
    const db = drizzle(env.DB);
    const secondUserId = "discord-relink-user";
    await db.delete(accountTable).where(eq(accountTable.userId, firstUserId));
    await db.insert(userTable).values({
        id: secondUserId,
        name: "Discord Relink User",
        email: "discord-relink-user@example.com",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        githubId: 424242,
        githubUsername: "discord-relink-user",
    });
    await db.insert(accountTable).values({
        id: crypto.randomUUID(),
        accountId: discordId,
        providerId: "discord",
        userId: secondUserId,
    });

    await checkQuestsForUser(env, secondUserId);

    const discordRewards = (userId: string) =>
        db
            .select({
                questId: rewardsTable.questId,
                pollenAmount: rewardsTable.pollenAmount,
            })
            .from(rewardsTable)
            .where(
                and(
                    eq(rewardsTable.userId, userId),
                    like(rewardsTable.questId, "%discord%"),
                ),
            )
            .orderBy(rewardsTable.questId);
    expect(await discordRewards(firstUserId)).toEqual([
        { questId: "discord_boost", pollenAmount: 20 },
        { questId: "discord_level_10", pollenAmount: 2 },
        { questId: "discord_level_20", pollenAmount: 5 },
        { questId: "join_discord", pollenAmount: 1 },
    ]);
    expect(await discordRewards(secondUserId)).toEqual([]);
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
