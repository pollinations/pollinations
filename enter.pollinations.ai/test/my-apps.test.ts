import { describe, expect, it } from "vitest";
import { appsOwnedBy, type ListedApp } from "../frontend/src/lib/my-apps.ts";

function makeApp(overrides: Partial<ListedApp> & { name: string }): ListedApp {
    return {
        emoji: "🎬",
        web_url: `https://example.com/${overrides.name.toLowerCase()}`,
        screenshot_url: "",
        description: "Test app",
        category: "creative",
        platform: "web",
        github_user_id: "63298614",
        github_repository_url: "",
        github_repository_stars: "",
        issue_url: "",
        approved_date: "2026-10-01",
        byop: "",
        requests_24h: "",
        ...overrides,
    };
}

describe("appsOwnedBy", () => {
    it("returns only apps matching githubId, sorted newest first", () => {
        const rows = [
            makeApp({
                name: "Older App",
                github_user_id: "63298614",
                approved_date: "2026-09-20",
            }),
            makeApp({
                name: "Someone Else",
                github_user_id: "999999",
                approved_date: "2026-10-16",
            }),
            makeApp({
                name: "Echo Island",
                github_user_id: "63298614",
                approved_date: "2026-10-16",
            }),
        ];
        expect(appsOwnedBy(rows, "63298614").map((a) => a.name)).toEqual([
            "Echo Island",
            "Older App",
        ]);
    });

    it("deduplicates identical app identities", () => {
        const rows = [
            makeApp({
                name: "Echo Island",
                web_url:
                    "https://huggingface.co/spaces/xiaotian1171/echo-island",
                approved_date: "2026-10-16",
            }),
            makeApp({
                name: "Echo Island",
                web_url:
                    "https://huggingface.co/spaces/xiaotian1171/echo-island",
                approved_date: "2026-10-16",
            }),
        ];
        expect(appsOwnedBy(rows, "63298614")).toHaveLength(1);
    });

    it("returns an empty array when the user has no listed apps or no githubId", () => {
        const rows = [makeApp({ name: "Other", github_user_id: "7" })];
        expect(appsOwnedBy(rows, "63298614")).toEqual([]);
        expect(appsOwnedBy(rows, null)).toEqual([]);
    });
});
