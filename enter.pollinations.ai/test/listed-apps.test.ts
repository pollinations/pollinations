import { expect, test } from "vitest";
import {
    type AppDirectoryRow,
    formatListedApps,
} from "../src/services/listed-apps.ts";

const row = (overrides: Partial<AppDirectoryRow>): AppDirectoryRow => ({
    emoji: "🎨",
    name: "App",
    description: "An app",
    category: "image",
    platform: "web",
    web_url: "",
    screenshot_url: "",
    github_user_id: "1",
    github_repository_url: "",
    issue_url: "",
    approved_date: "",
    byop: "",
    requests_24h: "",
    ...overrides,
});

test("keeps only the account's listings, newest approval first", () => {
    const rows = [
        row({
            name: "Older",
            github_user_id: "1",
            approved_date: "2026-01-02",
        }),
        row({
            name: "Other",
            github_user_id: "2",
            approved_date: "2026-03-01",
        }),
        row({
            name: "Newer",
            github_user_id: "1",
            approved_date: "2026-02-01",
        }),
        row({ name: "No date", github_user_id: "1" }),
    ];

    expect(formatListedApps(rows, "1").map((app) => app.name)).toEqual([
        "Newer",
        "Older",
        "No date",
    ]);
});

test("turns the catalog's empty strings and string columns into display values", () => {
    const [app] = formatListedApps(
        [
            row({
                byop: "true",
                requests_24h: "42",
                web_url: "https://app.test",
                approved_date: "2026-02-01",
                issue_url:
                    "https://github.com/pollinations/pollinations/issues/1",
            }),
        ],
        "1",
    );

    expect(app).toMatchObject({
        byop: true,
        requests24h: 42,
        webUrl: "https://app.test",
        approvedDate: "2026-02-01",
        screenshotUrl: null,
        repositoryUrl: null,
    });
});

test("keeps the 24h request count even for a non-BYOP app", () => {
    const [app] = formatListedApps([row({ requests_24h: "42" })], "1");

    expect(app).toMatchObject({ byop: false, requests24h: 42 });
});

test("an account that never listed an app gets no listings", () => {
    expect(formatListedApps([row({ github_user_id: "2" })], "1")).toEqual([]);
});
