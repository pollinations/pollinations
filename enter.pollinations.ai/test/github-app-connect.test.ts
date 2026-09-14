import { env, SELF } from "cloudflare:test";
import { account as accountTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
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
        login: null,
        installationCount: 0,
        repositorySelection: null,
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
            repository_selection: "selected",
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
        login: "testuser",
        installationCount: 1,
        repositorySelection: "selected",
        personalInstalled: true,
        manageUrl: "https://github.com/settings/installations/4242",
    });

    const disconnect = await SELF.fetch(
        "http://localhost:3000/api/auth/unlink-account",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie(sessionToken),
                Origin: "http://localhost:3000",
            },
            body: JSON.stringify({ providerId: "github-app" }),
        },
    );
    expect(disconnect.status).toBe(200);
    expect(
        (await drizzle(env.DB).select().from(accountTable)).some(
            (account) => account.providerId === "github-app",
        ),
    ).toBe(false);
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

test("refreshes expired GitHub App user tokens through Better Auth", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");
    const callback = await authorizeGithubApp(sessionToken);
    expect(callback.status).toBe(302);

    const db = drizzle(env.DB);
    const [account] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.providerId, "github-app"));
    await db
        .update(accountTable)
        .set({ accessTokenExpiresAt: new Date(Date.now() - 60_000) })
        .where(eq(accountTable.id, account.id));
    mocks.github.state.requests = [];

    const response = await SELF.fetch(
        "http://localhost:3000/api/github-app/status",
        { headers: { Cookie: cookie(sessionToken) } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        authorized: true,
        login: "testuser",
    });
    expect(
        mocks.github.state.requests.filter(
            ({ path }) => path === "/login/oauth/access_token",
        ),
    ).toHaveLength(1);

    const [refreshed] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.id, account.id));
    expect(refreshed.accessTokenExpiresAt?.getTime()).toBeGreaterThan(
        Date.now(),
    );
    expect(refreshed.accessToken).not.toBe(account.accessToken);
    expect(refreshed.accessToken).not.toBe(
        "mock_github_app_user_token_refreshed",
    );
    expect(refreshed.refreshToken).not.toBe(account.refreshToken);
    expect(refreshed.refreshToken).not.toBe(
        "mock_github_app_refresh_token_rotated",
    );
});

test("existing plaintext GitHub login tokens remain usable", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB);
    const [account] = await db
        .select()
        .from(accountTable)
        .where(eq(accountTable.providerId, "github"));
    await db
        .update(accountTable)
        .set({ accessToken: "mock_github_auth_token" })
        .where(eq(accountTable.id, account.id));

    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/get-access-token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: cookie(sessionToken),
                Origin: "http://localhost:3000",
            },
            body: JSON.stringify({
                providerId: "github",
                accountId: account.accountId,
            }),
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        accessToken: "mock_github_auth_token",
    });
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

test("does not allow standalone sign-in through an already linked GitHub App", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");
    expect((await authorizeGithubApp(sessionToken)).status).toBe(302);

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
