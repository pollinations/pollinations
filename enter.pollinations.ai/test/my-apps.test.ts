import { expect, it } from "vitest";
import { appsOwnedBy, type ListedApp } from "../frontend/src/lib/my-apps";

const app = (name: string, github_user_id: string, approved_date: string) =>
    ({ name, github_user_id, approved_date }) as ListedApp;

it("returns only the account's listings, newest first", () => {
    const rows = [
        app("old", "42", "2025-01-01"),
        app("other", "7", "2026-01-01"),
        app("new", "42", "2026-03-01"),
    ];
    expect(appsOwnedBy(rows, "42").map((a) => a.name)).toEqual(["new", "old"]);
});

it("returns nothing for an account without listings", () => {
    expect(appsOwnedBy([app("a", "7", "2026-01-01")], "42")).toEqual([]);
});
