import { describe, expect, it } from "vitest";
import { appsOwnedBy, type ListedApp } from "../frontend/src/lib/my-apps";

describe("appsOwnedBy", () => {
    it("returns only the account's listings, newest first", () => {
        const rows: ListedApp[] = [
            {
                name: "Old App",
                description: null,
                url: null,
                image: null,
                approved_date: "2024-01-15T00:00:00Z",
                github_user_id: "12345",
            },
            {
                name: "New App",
                description: null,
                url: null,
                image: null,
                approved_date: "2024-03-20T00:00:00Z",
                github_user_id: "12345",
            },
            {
                name: "Other User App",
                description: null,
                url: null,
                image: null,
                approved_date: "2024-02-10T00:00:00Z",
                github_user_id: "99999",
            },
        ];

        const result = appsOwnedBy(rows, "12345");

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("New App");
        expect(result[1].name).toBe("Old App");
    });

    it("returns nothing for an account without listings", () => {
        const rows: ListedApp[] = [
            {
                name: "Someone Else's App",
                description: null,
                url: null,
                image: null,
                approved_date: "2024-01-15T00:00:00Z",
                github_user_id: "99999",
            },
        ];

        const result = appsOwnedBy(rows, "12345");

        expect(result).toEqual([]);
    });

    it("handles null/undefined githubId gracefully", () => {
        const rows: ListedApp[] = [
            {
                name: "App",
                description: null,
                url: null,
                image: null,
                approved_date: "2024-01-15T00:00:00Z",
                github_user_id: "12345",
            },
        ];

        expect(appsOwnedBy(rows, null as unknown as string)).toEqual([]);
        expect(appsOwnedBy(rows, undefined as unknown as string)).toEqual([]);
    });

    it("handles empty rows array", () => {
        const result = appsOwnedBy([], "12345");
        expect(result).toEqual([]);
    });

    it("handles rows with missing optional fields", () => {
        const rows: ListedApp[] = [
            {
                name: "Minimal App",
                description: null,
                url: null,
                image: null,
                approved_date: null,
                github_user_id: "12345",
            },
        ];

        const result = appsOwnedBy(rows, "12345");

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Minimal App");
        expect(result[0].approved_date).toBeNull();
    });
});
