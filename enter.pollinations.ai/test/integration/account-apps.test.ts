import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("GET /api/account/apps", () => {
    test("requires authentication", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
        );

        expect(response.status).toBe(401);
    });

    test("returns only the signed-in GitHub user's unique listings, newest first", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("github", "tinybird");
        const app = {
            github_user_id: "12345",
            name: "My demo",
            web_url: "https://example.com/demo",
            screenshot_url: "https://example.com/demo.png",
            description: "A listed community app",
            category: "build",
            platform: "web",
            github_repository_url: "https://github.com/example/demo",
            github_repository_stars: "⭐12",
            issue_url: "https://github.com/example/demo/issues/1",
            approved_date: "2026-10-15",
            byop: true,
            requests_24h: 12,
        };
        mocks.tinybird.state.appDirectoryResponse = [
            { ...app, approved_date: "2026-10-14" },
            { ...app, approved_date: "2026-10-15" },
            { ...app, github_user_id: "654321", name: "Someone else's app" },
        ];

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            apps: {
                name: string;
                approvedDate: string;
                repositoryStars: number;
                issueUrl: string;
                requests24h: number;
            }[];
        };
        expect(body.apps).toHaveLength(1);
        expect(body.apps[0]).toMatchObject({
            name: "My demo",
            approvedDate: "2026-10-15",
            repositoryStars: 12,
            issueUrl: "https://github.com/example/demo/issues/1",
            requests24h: 12,
        });
        expect(mocks.tinybird.state.pipeCalls).toContainEqual(
            expect.objectContaining({
                url: expect.stringContaining("app_directory_public.json"),
            }),
        );
        expect(mocks.tinybird.state.pipeCalls).toContainEqual(
            expect.objectContaining({
                url: expect.stringContaining("github_user_id=12345"),
            }),
        );
    }, 20_000);

    test("returns an empty list without querying the catalog when GitHub is unlinked", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("github", "tinybird");
        const db = drizzle(env.DB);
        await db
            .update(userTable)
            .set({ githubId: null })
            .where(eq(userTable.githubId, "12345"));
        mocks.tinybird.state.pipeCalls = [];

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ apps: [] });
        expect(mocks.tinybird.state.pipeCalls).toHaveLength(0);
    }, 20_000);

    test("returns an empty list when the linked GitHub user has no listings", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("github", "tinybird");
        mocks.tinybird.state.appDirectoryResponse = [];

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ apps: [] });
        expect(mocks.tinybird.state.pipeCalls).toContainEqual(
            expect.objectContaining({
                url: expect.stringContaining("app_directory_public.json"),
            }),
        );
    }, 20_000);
});
