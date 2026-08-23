import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const cookie = (sessionToken: string) =>
    `better-auth.session_token=${sessionToken}`;

test("reports and starts a personal GitHub App connection", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");

    const disconnected = await SELF.fetch(
        "http://localhost:3000/api/github-app/status",
        { headers: { Cookie: cookie(sessionToken) } },
    );
    expect(disconnected.status).toBe(200);
    expect(await disconnected.json()).toEqual({
        configured: true,
        connected: false,
        manageUrl: null,
    });

    const install = await SELF.fetch(
        "http://localhost:3000/api/github-app/install",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(install.status).toBe(302);
    expect(install.headers.get("location")).toBe(
        "https://github.com/apps/pollinations-connect-test/installations/new",
    );
});

test("accepts only the signed-in user's verified personal installation", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("github");
    mocks.github.state.userInstallation = {
        id: 4242,
        account: {
            id: mocks.github.state.user.id,
            login: mocks.github.state.user.login,
        },
        target_type: "User",
        html_url: "https://github.com/settings/installations/4242",
    };

    const status = await SELF.fetch(
        "http://localhost:3000/api/github-app/status",
        { headers: { Cookie: cookie(sessionToken) } },
    );
    expect(await status.json()).toEqual({
        configured: true,
        connected: true,
        manageUrl: "https://github.com/settings/installations/4242",
    });

    const spoofed = await SELF.fetch(
        "http://localhost:3000/api/github-app/callback?installation_id=9999",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(spoofed.status).toBe(403);

    const verified = await SELF.fetch(
        "http://localhost:3000/api/github-app/callback?installation_id=4242",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/account");

    mocks.github.state.userInstallation.target_type = "Organization";
    const organization = await SELF.fetch(
        "http://localhost:3000/api/github-app/callback?installation_id=4242",
        {
            headers: { Cookie: cookie(sessionToken) },
            redirect: "manual",
        },
    );
    expect(organization.status).toBe(403);
});
