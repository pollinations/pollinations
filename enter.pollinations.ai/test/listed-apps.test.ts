import { describe, expect, it } from "vitest";
import {
    type AppDirectoryRow,
    listedAppsFor,
} from "../src/services/listed-apps.ts";

const row = (overrides: Partial<AppDirectoryRow>): AppDirectoryRow => ({
    emoji: "🧩",
    name: "An App",
    web_url: "https://an-app.example",
    screenshot_url: null,
    description: "Does a thing",
    category: "creative",
    platform: "web",
    github_user_id: "12345",
    github_repository_url: null,
    issue_url: null,
    approved_date: "2026-01-01",
    byop: false,
    requests_24h: null,
    ...overrides,
});

describe("listedAppsFor", () => {
    it("returns only the listings owned by the github id", () => {
        const apps = listedAppsFor(
            [
                row({ name: "Mine" }),
                row({ name: "Someone else's", github_user_id: "999" }),
                row({ name: "Unlinked", github_user_id: "" }),
            ],
            "12345",
        );

        expect(apps.map((app) => app.name)).toEqual(["Mine"]);
    });

    it("matches a numeric github id against the string column", () => {
        expect(listedAppsFor([row({})], 12345).map((app) => app.name)).toEqual([
            "An App",
        ]);
        expect(
            listedAppsFor([row({ github_user_id: 12345 })], 12345),
        ).toHaveLength(1);
    });

    it("returns nothing for an account without a linked github id", () => {
        expect(listedAppsFor([row({})], null)).toEqual([]);
        expect(listedAppsFor([row({})], undefined)).toEqual([]);
        expect(listedAppsFor([row({})], "")).toEqual([]);
    });

    it("orders newest approval first and undated listings last", () => {
        const apps = listedAppsFor(
            [
                row({ name: "Old", approved_date: "2025-05-01" }),
                row({ name: "Pending", approved_date: "" }),
                row({ name: "New", approved_date: "2026-09-01" }),
            ],
            12345,
        );

        expect(apps.map((app) => app.name)).toEqual(["New", "Old", "Pending"]);
    });

    it("coerces the string columns the directory sync writes", () => {
        const [app] = listedAppsFor(
            [
                row({
                    byop: "1",
                    requests_24h: "42",
                    platform: "Web, Android",
                    screenshot_url: null,
                }),
            ],
            12345,
        );

        expect(app.byop).toBe(true);
        expect(app.requests24h).toBe(42);
        expect(app.platforms).toEqual(["web", "android"]);
        expect(app.screenshotUrl).toBeNull();
    });

    it("reports traffic only for Pollen Pay apps", () => {
        const [byop, plain] = listedAppsFor(
            [
                row({ name: "Byop", byop: true, requests_24h: "7" }),
                // The developer's whole-account traffic is not this listing's.
                row({ name: "Plain", byop: false, requests_24h: "900" }),
            ],
            12345,
        );

        expect(byop.requests24h).toBe(7);
        expect(plain.requests24h).toBeNull();
    });

    it("collapses duplicate listings the way the directory does", () => {
        const apps = listedAppsFor([row({}), row({})], 12345);
        expect(apps).toHaveLength(1);
    });
});
