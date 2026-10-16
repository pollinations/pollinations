import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (accountToken: string) => ({
    Authorization: `Bearer ${accountToken}`,
});

async function getOnlyUser() {
    const db = drizzle(env.DB, { schema });
    const users = await db
        .select({ id: schema.user.id, githubId: schema.user.githubId })
        .from(schema.user)
        .limit(1);
    const user = users[0];
    if (!user) throw new Error("Expected fixture user");
    return user;
}

const directoryRow = (overrides: Record<string, unknown> = {}) => ({
    name: "Trolley Problem Game",
    emoji: "🚋",
    web_url: "https://trolley.example",
    screenshot_url: "https://trolley.example/shot.png",
    description: "Pick who to save.",
    language: "en",
    category: "play",
    platform: "web",
    github_user_id: "someone-else",
    github_repository_url: "https://github.com/other/trolley",
    github_repository_stars: "",
    submitted_date: "2026-10-01",
    issue_url: "https://github.com/pollinations/pollinations/issues/1",
    approved_date: "2026-10-02",
    byop: "",
    requests_24h: "",
    ...overrides,
});

test("GET /api/account/my-apps returns the caller's listings, newest first", async ({
    accountToken,
    mocks,
}) => {
    const user = await getOnlyUser();
    if (user.githubId === null) throw new Error("Expected fixture GitHub id");
    await mocks.enable("tinybird");

    mocks.tinybird.state.appDirectoryResponse = [
        directoryRow(),
        directoryRow({
            name: "Quiz Whiz",
            web_url: "https://quiz.example",
            github_user_id: String(user.githubId),
            approved_date: "2026-09-01",
        }),
        directoryRow({
            name: "Pollinations Blocks",
            web_url: "https://blocks.example",
            github_user_id: String(user.githubId),
            approved_date: "2026-10-15",
            byop: "true",
            requests_24h: 12,
            github_repository_stars: "⭐1.2k",
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
        {
            headers: authHeaders(accountToken),
        },
    );
    expect(response.status).toBe(200);

    const { apps } = (await response.json()) as {
        apps: Array<Record<string, unknown>>;
    };

    // Only the caller's rows, newest first, with the public catalog fields.
    expect(apps).toHaveLength(2);
    expect(apps[0]).toMatchObject({
        name: "Pollinations Blocks",
        webUrl: "https://blocks.example",
        byop: true,
        requests24h: 12,
        repositoryStars: "⭐1.2k",
        approvedDate: "2026-10-15",
    });
    expect(apps[1]).toMatchObject({
        name: "Quiz Whiz",
        byop: false,
        requests24h: null,
    });
});

test("GET /api/account/my-apps collapses duplicate listings and drops nameless rows", async ({
    accountToken,
    mocks,
}) => {
    const user = await getOnlyUser();
    if (user.githubId === null) throw new Error("Expected fixture GitHub id");
    await mocks.enable("tinybird");

    mocks.tinybird.state.appDirectoryResponse = [
        // Exact duplicate: same name and URL, listed twice.
        directoryRow({
            github_user_id: String(user.githubId),
            approved_date: "2026-10-14",
        }),
        directoryRow({
            github_user_id: String(user.githubId),
            approved_date: "2026-10-15",
        }),
        // Same name, different URL: a distinct app, kept.
        directoryRow({
            web_url: "https://trolley-2.example",
            github_user_id: String(user.githubId),
        }),
        // An empty name is not a listing.
        directoryRow({
            name: "",
            github_user_id: String(user.githubId),
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
        {
            headers: authHeaders(accountToken),
        },
    );
    expect(response.status).toBe(200);

    const { apps } = (await response.json()) as {
        apps: Array<Record<string, unknown>>;
    };
    expect(apps.map((app) => app.name)).toEqual([
        "Trolley Problem Game",
        "Trolley Problem Game",
    ]);
    expect(apps.map((app) => app.webUrl)).toEqual([
        "https://trolley.example",
        "https://trolley-2.example",
    ]);
});

test("GET /api/account/my-apps returns an empty list for an unlisted developer", async ({
    accountToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    mocks.tinybird.state.appDirectoryResponse = [
        directoryRow({ github_user_id: "someone-else" }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
        {
            headers: authHeaders(accountToken),
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apps: [] });
});

test("GET /api/account/my-apps returns an empty list without a GitHub link", async ({
    accountToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const user = await getOnlyUser();
    const db = drizzle(env.DB);
    await db
        .update(schema.user)
        .set({ githubId: null })
        .where(eq(schema.user.id, user.id));

    mocks.tinybird.state.appDirectoryResponse = [
        directoryRow({ github_user_id: String(user.githubId ?? "") }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
        {
            headers: authHeaders(accountToken),
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apps: [] });
    // No directory read is needed once matching is impossible.
    expect(
        mocks.tinybird.state.pipeCalls.some((call) =>
            call.url.includes("/v0/pipes/app_directory_public.json"),
        ),
    ).toBe(false);
});

test("GET /api/account/my-apps reports an unavailable directory as 502", async ({
    accountToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    mocks.tinybird.state.appDirectoryFails = true;

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
        {
            headers: authHeaders(accountToken),
        },
    );
    expect(response.status).toBe(502);
});

test("GET /api/account/my-apps requires authorization", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/my-apps",
    );
    expect(response.status).toBe(401);
});
