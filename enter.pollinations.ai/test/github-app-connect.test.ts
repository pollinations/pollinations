import { env, SELF } from "cloudflare:test";
import { account as accountTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const cookie = (sessionToken: string) =>
    `better-auth.session_token=${sessionToken}`;

async function authorizeGithubApp(sessionToken: string) {
    const authorize = await SELF.fetch(
        "http://localhost:3000/api/github-app/authorize",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(authorize.status).toBe(302);
    const authorizationUrl = authorize.headers.get("location");
    const stateCookie = authorize.headers.get("set-cookie");
    if (!authorizationUrl || !stateCookie) {
        throw new Error("Expected GitHub App OAuth state");
    }
    const state = new URL(authorizationUrl).searchParams.get("state");
    if (!state) throw new Error("Expected GitHub App OAuth state value");

    return SELF.fetch(
        `http://localhost:3000/api/auth/oauth2/callback/github-app?code=github-app-code&state=${encodeURIComponent(state)}`,
        {
            headers: {
                Accept: "text/html,application/xhtml+xml",
                Cookie: `${cookie(sessionToken)}; ${stateCookie}`,
                "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            },
            redirect: "manual",
        },
    );
}

test("connects an installed GitHub App with encrypted delegated tokens", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");

    const disconnected = await SELF.fetch(
        "http://localhost:3000/api/github-app/status",
        { headers: { Cookie: cookie(sessionToken) } },
    );
    expect(await disconnected.json()).toEqual({
        configured: true,
        connected: false,
        authorized: false,
        manageUrl: null,
    });

    const install = await SELF.fetch(
        "http://localhost:3000/api/github-app/install",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(install.headers.get("location")).toBe(
        "https://github.com/apps/pollinations-connect-test/installations/new",
    );

    const setup = await SELF.fetch(
        "http://localhost:3000/api/github-app/callback?installation_id=4242",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(setup.headers.get("location")).toBe("/api/github-app/authorize");

    mocks.github.state.userInstallations = [
        {
            id: 4242,
            account: {
                id: mocks.github.state.user.id,
                login: mocks.github.state.user.login,
            },
            target_type: "User",
            html_url: "https://github.com/settings/installations/4242",
        },
    ];

    const callback = await authorizeGithubApp(sessionToken);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/account");

    const githubAppAccount = (
        await drizzle(env.DB).select().from(accountTable)
    ).find((account) => account.providerId === "github-app");
    expect(githubAppAccount).toMatchObject({
        accountId: String(mocks.github.state.user.id),
    });
    expect(githubAppAccount?.accessToken).not.toBe(
        "mock_github_app_user_token",
    );
    expect(githubAppAccount?.refreshToken).not.toBe(
        "mock_github_app_refresh_token",
    );

    const connected = await SELF.fetch(
        "http://localhost:3000/api/github-app/status",
        { headers: { Cookie: cookie(sessionToken) } },
    );
    expect(await connected.json()).toEqual({
        configured: true,
        connected: true,
        authorized: true,
        personalInstalled: true,
        manageUrl: "https://github.com/settings/installations/4242",
    });
});

test("rejects authorization from a different GitHub account", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");
    mocks.github.state.user.id = 99999;

    const callback = await authorizeGithubApp(sessionToken);
    expect(callback.status).toBe(400);

    const githubAppAccount = (
        await drizzle(env.DB).select().from(accountTable)
    ).find((account) => account.providerId === "github-app");
    expect(githubAppAccount).toBeUndefined();
});

test("does not allow the delegated GitHub App provider for sign-up", async ({
    mocks,
}) => {
    await mocks.enable("github");
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/oauth2",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId: "github-app" }),
        },
    );
    expect(response.status).toBe(400);
});
