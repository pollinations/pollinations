import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

test("GET /api/account/apps returns APPS.md matches for the signed-in GitHub user", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.appsResponse = [
        {
            emoji: "🧠",
            name: "RepoRay",
            webUrl: "https://repo-ray.vercel.app",
            description: "Pass through row as returned by Tinybird.",
            language: "en",
            category: "business",
            platform: "web",
            githubUsername: "testuser",
            githubUserId: "12345",
            repoUrl: "https://github.com/testuser/reporay",
            repoStars: "⭐3",
            discordUsername: "testuser",
            other: "extra metadata",
            submittedDate: "2026-04-19",
            issueUrl: "https://github.com/pollinations/pollinations/issues/1",
            approvedDate: "2026-04-20",
            byop: "true",
            requests24h: 7,
        },
        {
            emoji: "🎨",
            name: "Sketchbook",
            webUrl: "",
            description: "Thin proxy should preserve empty webUrl.",
            language: "en",
            category: "image",
            platform: "desktop",
            githubUsername: "testuser",
            githubUserId: "12345",
            repoUrl: "https://github.com/testuser/sketchbook",
            repoStars: "⭐1",
            discordUsername: "",
            submittedDate: "2026-04-18",
            issueUrl: "https://github.com/pollinations/pollinations/issues/3",
            approvedDate: "2026-04-19",
            byop: "false",
            requests24h: 0,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/apps",
        {
            headers: authHeaders(sessionToken),
        },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
        name: string;
        webUrl?: string | null;
        byop?: string | boolean | null;
        requests24h?: number | null;
        other?: string | null;
        githubUsername?: string | null;
    }>;

    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
        name: "RepoRay",
        webUrl: "https://repo-ray.vercel.app",
        byop: "true",
        requests24h: 7,
        other: "extra metadata",
        githubUsername: "testuser",
    });
    expect(body[1]).toMatchObject({
        name: "Sketchbook",
        webUrl: "",
        byop: "false",
        requests24h: 0,
    });

    const appCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_apps.json"),
    );
    expect(appCalls).toHaveLength(1);
    expect(appCalls[0].query.github_user_id).toBe("12345");
    expect(appCalls[0].query.github_username).toBeUndefined();
});
