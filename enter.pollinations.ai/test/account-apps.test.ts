import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import {
    type ListedAppRow,
    selectListedApps,
} from "../src/services/listed-apps.ts";
import { test } from "./fixtures.ts";

function row(overrides: Partial<ListedAppRow>): ListedAppRow {
    return {
        emoji: "🧩",
        name: "Example App",
        web_url: "https://example.com",
        screenshot_url: null,
        description: "An example app.",
        language: "en",
        category: "tools",
        platform: "web",
        github_username: "octocat",
        github_user_id: "1",
        github_repository_url: "https://github.com/octocat/example",
        github_repository_stars: "⭐12",
        discord_username: null,
        submitted_date: "2026-01-01",
        issue_url: "https://github.com/pollinations/pollinations/issues/1000",
        approved_date: "2026-01-02",
        byop: false,
        requests_24h: null,
        ...overrides,
    };
}

describe("selectListedApps", () => {
    test("keeps only the owner's listings", () => {
        const mine = row({ github_user_id: "42", name: "Mine" });
        const theirs = row({ github_user_id: "7", name: "Theirs" });
        expect(selectListedApps([mine, theirs], "42")).toEqual([mine]);
    });

    test("collapses exact duplicates and orders newest approval first", () => {
        const older = row({
            name: "Older",
            github_user_id: "42",
            approved_date: "2026-01-01",
        });
        const newer = row({
            name: "Newer",
            github_user_id: "42",
            approved_date: "2026-09-01",
        });
        const duplicate = row({
            name: "newer",
            web_url: newer.web_url,
            github_user_id: "42",
            approved_date: "2026-09-02",
        });
        expect(selectListedApps([older, newer, duplicate], "42")).toEqual([
            newer,
            older,
        ]);
    });

    test("no linked GitHub user yields nothing", () => {
        expect(selectListedApps([row({ github_user_id: "42" })], null)).toEqual(
            [],
        );
    });
});

async function getApps(headers: Record<string, string>) {
    return SELF.fetch("http://localhost:3000/api/account/apps", { headers });
}

async function fixtureUser() {
    const user = await drizzle(env.DB)
        .select({ id: userTable.id, githubId: userTable.githubId })
        .from(userTable)
        .get();
    if (!user) throw new Error("Missing fixture user");
    return user;
}

describe("GET /api/account/apps", () => {
    test("returns the account's listings, newest approval first", async ({
        mocks,
        accountToken,
    }) => {
        await mocks.enable("tinybird");
        const user = await fixtureUser();
        const githubUserId = String(user.githubId);
        mocks.tinybird.state.appDirectoryResponse = [
            row({
                name: "Older",
                github_user_id: githubUserId,
                approved_date: "2026-01-01",
            }),
            row({
                name: "Newer",
                github_user_id: githubUserId,
                approved_date: "2026-09-01",
                byop: 1,
                requests_24h: "42",
            }),
            row({ name: "Someone Else's", github_user_id: "999999" }),
        ];

        const res = await getApps({ Authorization: `Bearer ${accountToken}` });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { apps: ListedAppRow[] };
        expect(body.apps.map((app) => app.name)).toEqual(["Newer", "Older"]);
        expect(body.apps[0]?.requests_24h).toBe("42");
    });

    test("an account without a linked GitHub user gets an empty list", async ({
        mocks,
        accountToken,
    }) => {
        await mocks.enable("tinybird");
        const user = await fixtureUser();
        await drizzle(env.DB)
            .update(userTable)
            .set({ githubId: null })
            .where(eq(userTable.id, user.id));
        mocks.tinybird.state.appDirectoryResponse = [
            row({ github_user_id: "42" }),
        ];

        const res = await getApps({ Authorization: `Bearer ${accountToken}` });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ apps: [] });
    });

    test("an empty directory yields an empty list", async ({
        mocks,
        accountToken,
    }) => {
        await mocks.enable("tinybird");
        const res = await getApps({ Authorization: `Bearer ${accountToken}` });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ apps: [] });
    });

    test("unauthenticated requests are rejected", async () => {
        const res = await getApps({});
        expect(res.status).toBe(401);
    });
});
