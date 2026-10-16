import {
    appIdentity,
    appsOwnedBy,
    byopRequests24h,
    type DirectoryApp,
} from "@frontend/data/app-directory.ts";
import { describe, expect, it } from "vitest";

function makeApp(overrides: Partial<DirectoryApp>): DirectoryApp {
    return {
        name: "App",
        web_url: "https://example.com/app",
        screenshot_url: null,
        description: "",
        category: "games",
        platform: "web",
        github_user_id: "42",
        github_username: "dev",
        github_repository_url: "https://github.com/dev/app",
        github_repository_stars: "",
        byop: "false",
        requests_24h: null,
        approved_date: "2026-01-01",
        ...overrides,
    };
}

describe("my apps owner match", () => {
    it("returns only apps owned by the given github id", () => {
        const rows = [
            makeApp({ name: "Mine" }),
            makeApp({ name: "Theirs", github_user_id: "7" }),
        ];
        const owned = appsOwnedBy(rows, 42);
        expect(owned.map((app) => app.name)).toEqual(["Mine"]);
    });

    it("matches ids as strings and tolerates padding and empty ids", () => {
        expect(
            appsOwnedBy([makeApp({ github_user_id: " 42 " })], 42),
        ).toHaveLength(1);
        expect(appsOwnedBy([makeApp({ github_user_id: "" })], 42)).toHaveLength(
            0,
        );
    });

    it("returns nothing without a github id", () => {
        const rows = [makeApp({})];
        expect(appsOwnedBy(rows, null)).toEqual([]);
        expect(appsOwnedBy(rows, undefined as unknown as null)).toEqual([]);
    });

    it("collapses exact duplicates like the public catalog", () => {
        const rows = [makeApp({ name: "Mine" }), makeApp({ name: "mine" })];
        expect(appsOwnedBy(rows, 42)).toHaveLength(1);
        expect(appIdentity(rows[0])).toBe(appIdentity(rows[1]));
    });

    it("lists newest approvals first", () => {
        const rows = [
            makeApp({ name: "Older", approved_date: "2025-01-01" }),
            makeApp({ name: "Newer", approved_date: "2026-01-01" }),
        ];
        expect(appsOwnedBy(rows, 42).map((app) => app.name)).toEqual([
            "Newer",
            "Older",
        ]);
    });

    it("reads BYOP traffic only for BYOP apps with known usage", () => {
        expect(
            byopRequests24h(makeApp({ byop: "true", requests_24h: "5" })),
        ).toBe(5);
        expect(byopRequests24h(makeApp({ requests_24h: "99" }))).toBeNull();
        expect(byopRequests24h(makeApp({ byop: "true" }))).toBeNull();
        expect(
            byopRequests24h(makeApp({ byop: "true", requests_24h: "" })),
        ).toBeNull();
    });
});
