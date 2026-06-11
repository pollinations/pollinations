import { env, SELF } from "cloudflare:test";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

// `POST /api/auth/sign-in/social` builds the provider's OAuth authorize URL
// locally and returns it — no token exchange happens yet, so these assertions
// need no network mocks. They verify each provider is registered and that our
// config (client id, callback path, prompt) flows through.
async function authorizeUrl(provider: string): Promise<{
    status: number;
    url: URL | null;
}> {
    const res = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider }),
        },
    );
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    return { status: res.status, url: data.url ? new URL(data.url) : null };
}

async function startOAuth(provider: "github" | "google"): Promise<{
    cookies: string;
    state: string;
}> {
    const res = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                callbackURL: "http://localhost:3000/",
            }),
        },
    );
    expect(res.status).toBe(200);
    const cookies = res.headers.get("Set-Cookie");
    expect(cookies).toBeTruthy();

    const data = (await res.json()) as { url: string };
    const state = new URL(data.url).searchParams.get("state");
    expect(state).toBeTruthy();

    return { cookies: cookies ?? "", state: state ?? "" };
}

async function finishOAuth(
    provider: "github" | "google",
    oauth: Awaited<ReturnType<typeof startOAuth>>,
): Promise<Response> {
    const callbackUrl = new URL(
        `http://localhost:3000/api/auth/callback/${provider}`,
    );
    callbackUrl.searchParams.set("code", "test-code");
    callbackUrl.searchParams.set("state", oauth.state);

    const res = await SELF.fetch(callbackUrl.toString(), {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            "Accept": "text/html,application/xhtml+xml",
            "Cookie": oauth.cookies,
        },
        redirect: "manual",
    });
    await res.text();
    return res;
}

async function completeOAuth(provider: "github" | "google"): Promise<Response> {
    return await finishOAuth(provider, await startOAuth(provider));
}

test("Google sign-in redirects to Google with our client id and callback", async () => {
    const { status, url } = await authorizeUrl("google");

    expect(status).toBe(200);
    expect(url?.hostname).toBe("accounts.google.com");
    // A client id is present (provider is configured); exact value depends on
    // the env source (.dev.vars vs wrangler test vars), so just assert it set.
    expect(url?.searchParams.get("client_id")).toBeTruthy();
    expect(url?.searchParams.get("redirect_uri")).toMatch(
        /\/api\/auth\/callback\/google$/,
    );
    // Our explicit provider option.
    expect(url?.searchParams.get("prompt")).toBe("select_account");
});

test("GitHub sign-in still works alongside Google", async () => {
    const { status, url } = await authorizeUrl("github");

    expect(status).toBe(200);
    expect(url?.hostname).toBe("github.com");
});

test("enabled auth providers are advertised from backend config", async () => {
    const res = await SELF.fetch("http://localhost:3000/api/auth-providers");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
        providers: [
            { id: "github", label: "GitHub" },
            { id: "google", label: "Google" },
        ],
    });
});

test("Google same verified email links to the existing GitHub user", async ({
    mocks,
}) => {
    await mocks.enable("github", "google", "tinybird");
    mocks.github.state.user = {
        ...mocks.github.state.user,
        id: 12345,
        login: "same-email-user",
        name: "Same Email User",
        email: "same@example.com",
    };
    mocks.google.state.user = {
        ...mocks.google.state.user,
        sub: "google-same-email-user",
        name: "Same Email User",
        email: "same@example.com",
        emailVerified: true,
    };

    const githubCallback = await completeOAuth("github");
    expect(githubCallback.status).toBe(302);

    const googleCallback = await completeOAuth("google");
    expect(googleCallback.status).toBe(302);

    const db = drizzle(env.DB);
    const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, "same@example.com"));
    const accounts = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.userId, users[0]?.id ?? ""));

    expect(users).toHaveLength(1);
    expect(users[0]?.emailVerified).toBe(true);
    expect(accounts.map((account) => account.providerId).sort()).toEqual([
        "github",
        "google",
    ]);
    expect(new Set(accounts.map((account) => account.userId)).size).toBe(1);
});

test("unverified same-email provider does not link to an existing account", async ({
    mocks,
}) => {
    await mocks.enable("github", "google", "tinybird");
    mocks.github.state.user = {
        ...mocks.github.state.user,
        id: 54321,
        login: "verified-github-user",
        name: "Verified GitHub User",
        email: "blocked-link@example.com",
    };
    mocks.google.state.user = {
        ...mocks.google.state.user,
        sub: "google-unverified-email-user",
        name: "Unverified Google User",
        email: "blocked-link@example.com",
        emailVerified: false,
    };

    const githubCallback = await completeOAuth("github");
    expect(githubCallback.status).toBe(302);

    const googleCallback = await completeOAuth("google");
    expect(googleCallback.status).toBe(302);
    expect(googleCallback.headers.get("Location")).toContain(
        "error=account_not_linked",
    );

    const db = drizzle(env.DB);
    const users = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, "blocked-link@example.com"));
    const accounts = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.userId, users[0]?.id ?? ""));

    expect(users).toHaveLength(1);
    expect(accounts.map((account) => account.providerId)).toEqual(["github"]);
});

test("Google-only signup initializes user tier and stores encrypted access token", async ({
    mocks,
}) => {
    await mocks.enable("google", "tinybird");
    mocks.google.state.user = {
        ...mocks.google.state.user,
        sub: "google-only-user",
        name: "Google Only User",
        email: "google-only@example.com",
        emailVerified: true,
    };

    const callback = await completeOAuth("google");
    expect(callback.status).toBe(302);

    const db = drizzle(env.DB);
    const [user] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, "google-only@example.com"));
    const [account] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.userId, user?.id ?? ""));

    expect(user).toMatchObject({
        email: "google-only@example.com",
        emailVerified: true,
        tier: "spore",
        githubId: null,
        githubUsername: null,
    });
    expect(user?.tierBalance).toBeGreaterThan(0);
    expect(account).toMatchObject({
        providerId: "google",
        accountId: "google-only-user",
    });
    expect(account?.accessToken).toBeTruthy();
    expect(account?.accessToken).not.toBe("mock_google_auth_token");
});
