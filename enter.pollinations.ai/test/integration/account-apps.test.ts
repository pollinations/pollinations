import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

// The mocked GitHub profile signs in as github id 12345.
const OTHER_OWNER = "99999";

const appRow = (overrides: Record<string, unknown> = {}) => ({
    emoji: "🧩",
    name: "My App",
    web_url: "https://my-app.example",
    screenshot_url: null,
    description: "An app",
    category: "creative",
    platform: "web",
    github_username: "testuser",
    github_user_id: "12345",
    github_repository_url: "https://github.com/testuser/my-app",
    issue_url: "https://github.com/pollinations/pollinations/issues/1",
    approved_date: "2026-01-01",
    byop: false,
    requests_24h: null,
    ...overrides,
});

describe("GET /api/account/apps", () => {
    test("requires authorization", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
        );
        expect(response.status).toBe(401);
    });

    test("lists the signed-in account's apps, newest approval first", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        mocks.tinybird.state.appDirectoryResponse = [
            appRow({
                name: "Older",
                approved_date: "2025-03-01",
            }),
            appRow({
                name: "Not mine",
                web_url: "https://theirs.example",
                github_user_id: OTHER_OWNER,
            }),
            appRow({
                name: "Newest",
                web_url: "https://newest.example",
                approved_date: "2026-09-01",
                byop: "1",
                requests_24h: "12",
            }),
        ];

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );

        expect(response.status).toBe(200);
        const { apps } = (await response.json()) as {
            apps: { name: string; byop: boolean; requests24h: number | null }[];
        };
        expect(apps.map((app) => app.name)).toEqual(["Newest", "Older"]);
        expect(apps[0]).toMatchObject({ byop: true, requests24h: 12 });
        expect(apps[1]).toMatchObject({ byop: false, requests24h: null });
    });

    test("returns an empty list for an account that has not listed an app", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        mocks.tinybird.state.appDirectoryResponse = [
            appRow({ github_user_id: OTHER_OWNER }),
        ];

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ apps: [] });
    });

    test("reports a directory rate limit instead of an empty catalog", async ({
        accountToken,
        mocks,
    }) => {
        mocks.tinybird.handlerMap["localhost:7181"] = async () =>
            new Response("Rate limited", { status: 429 });
        await mocks.enable("tinybird");
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            { headers: { Authorization: `Bearer ${accountToken}` } },
        );
        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("60");
    });
});
