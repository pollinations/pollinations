import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";

type SignupData = {
    url: string;
};

async function completeGithubOAuth() {
    const signupResponse = await SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            provider: "github",
        }),
    });

    const signupText = await signupResponse.text();
    expect(signupResponse.status, signupText).toBe(200);
    const signupData = JSON.parse(signupText) as SignupData;
    const signupCookies = signupResponse.headers.get("Set-Cookie");
    if (!signupCookies) throw new Error("Set-Cookie header is missing");

    const forwardUrl = new URL(signupData.url);
    const state = forwardUrl.searchParams.get("state");
    if (!state) throw new Error("State param is missing");

    const callbackUrl = new URL(`${BASE}/api/auth/callback/github`);
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

    await callbackResponse.text();
    return callbackResponse;
}

test("GitHub OAuth creates a fresh user when the email matches a banned deleted-account row", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    const db = drizzle(env.DB);
    const email = "same-email@example.com";
    const oldGithubId = 220466311;
    const newGithubId = 274875999;
    const oldUserId = "deleted-github-user";
    const now = new Date();

    await db.insert(userTable).values({
        id: oldUserId,
        name: "Deleted GitHub User",
        email,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        banned: true,
        banReason: "github_account_deleted",
        githubId: oldGithubId,
        githubUsername: "deleted-user",
        tier: "spore",
    });

    await db.insert(accountTable).values({
        id: "deleted-github-account",
        accountId: String(oldGithubId),
        providerId: "github",
        userId: oldUserId,
        createdAt: now,
        updatedAt: now,
    });

    mocks.github.state.user = {
        id: newGithubId,
        login: "fresh-user",
        name: "Fresh User",
        email,
        avatar_url: `https://avatars.githubusercontent.com/u/${newGithubId}?v=4`,
    };

    const callbackResponse = await completeGithubOAuth();

    expect(callbackResponse.status).toBe(302);
    const sessionCookie = callbackResponse.headers.get("Set-Cookie");
    expect(sessionCookie).toContain("better-auth.session_token=");

    const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email));

    expect(users).toHaveLength(2);

    const oldUser = users.find((user) => user.id === oldUserId);
    const freshUser = users.find((user) => user.id !== oldUserId);

    expect(oldUser?.banned).toBe(true);
    expect(oldUser?.githubId).toBe(oldGithubId);
    expect(freshUser?.banned).not.toBe(true);
    expect(freshUser?.githubId).toBe(newGithubId);
    expect(freshUser?.githubUsername).toBe("fresh-user");

    const [freshAccount] = await db
        .select()
        .from(accountTable)
        .where(
            and(
                eq(accountTable.providerId, "github"),
                eq(accountTable.accountId, String(newGithubId)),
            ),
        )
        .limit(1);

    expect(freshAccount?.userId).toBe(freshUser?.id);
    expect(freshAccount?.userId).not.toBe(oldUserId);
});
