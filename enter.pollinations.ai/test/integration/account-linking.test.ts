import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

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
    const discordAccount = (await db.select().from(accountTable)).find(
        (account) => account.providerId === "discord",
    );

    expect(discordAccount).toMatchObject({
        accountId: mocks.discord.state.userId,
        userId: user?.id,
    });
    expect(discordAccount?.accessToken).toBeTruthy();
    expect(discordAccount?.accessToken).not.toBe("mock_discord_access_token");
    expect(discordAccount?.refreshToken).toBeTruthy();
    expect(discordAccount?.refreshToken).not.toBe("mock_discord_refresh_token");

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

    const membershipResponse = await SELF.fetch(
        "http://localhost:3000/api/account/discord-membership",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(membershipResponse.status).toBe(200);
    await expect(membershipResponse.json()).resolves.toEqual({
        member: true,
        joinedAt: "2021-09-10T11:09:04.586000+00:00",
    });
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
