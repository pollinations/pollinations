import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

// The GitHub sign-in mock signs in user id 12345, which the auth hook stores
// as user.githubId.
const ownedRow = {
    emoji: "🎮",
    name: "Owned App",
    web_url: "https://example.com/owned",
    screenshot_url: "https://media.pollinations.ai/owned",
    description: "An app owned by the fixture account",
    language: "en",
    category: "games",
    platform: "web",
    github_username: "testuser",
    github_user_id: "12345",
    github_repository_url: "https://github.com/testuser/owned",
    github_repository_stars: "12",
    discord_username: null,
    submitted_date: "2026-10-01",
    issue_url: "https://github.com/pollinations/pollinations/issues/1",
    approved_date: "2026-10-02",
    byop: "false",
    requests_24h: "42",
};

const otherRow = {
    ...ownedRow,
    name: "Someone Else's App",
    github_username: "otherdev",
    github_user_id: "424242",
};

const fetchMyApps = (accountToken: string) =>
    SELF.fetch("http://localhost:3000/api/account/my-apps", {
        headers: { Authorization: `Bearer ${accountToken}` },
    });

test("returns only catalog rows owned by the account GitHub id", async ({
    accountToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    mocks.tinybird.state.appDirectoryResponse = [ownedRow, otherRow];

    const res = await fetchMyApps(accountToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ name: string }> };
    expect(body.data.map((row) => row.name)).toEqual(["Owned App"]);

    const directoryCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("app_directory_public"),
    );
    expect(directoryCalls).toHaveLength(1);
    expect(directoryCalls[0].query.limit).toBe("5000");
});

test("an account without a GitHub id gets an empty list", async ({
    accountToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    mocks.tinybird.state.appDirectoryResponse = [ownedRow];
    await drizzle(env.DB).update(userTable).set({ githubId: null });

    const res = await fetchMyApps(accountToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
    // Without a GitHub id there is nothing to match, so the directory is
    // never fetched.
    expect(mocks.tinybird.state.pipeCalls).toHaveLength(0);
});

test("unauthenticated requests are rejected", async () => {
    const res = await SELF.fetch("http://localhost:3000/api/account/my-apps");
    expect(res.status).toBe(401);
});
