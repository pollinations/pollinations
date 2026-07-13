import { env, SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

describe("Admin authentication", () => {
    const baseUrl = "https://enter.pollinations.ai";

    test("should reject requests without token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    test("should reject requests with invalid token", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer invalid_token",
                },
            },
        );
        expect(response.status).toBe(401);
    });

    test("should allow the sync token to export a d1 page", async () => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.TINYBIRD_SYNC_TOKEN}`,
                },
                body: JSON.stringify({
                    datasource: "d1_user",
                }),
            },
        );
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
            success: boolean;
            datasource: string;
            rows: unknown[];
            done: boolean;
        };
        expect(body.success).toBe(true);
        expect(body.datasource).toBe("d1_user");
        expect(body.rows).toEqual([]);
        expect(body.done).toBe(true);
    });

    test.each([
        ["unknown datasource", { datasource: "unknown" }],
        [
            "empty cursor",
            {
                datasource: "d1_user",
                cursor: "",
            },
        ],
    ])("should reject %s", async (_name, requestBody) => {
        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.TINYBIRD_SYNC_TOKEN}`,
                },
                body: JSON.stringify(requestBody),
            },
        );
        expect(response.status).toBe(400);
    });
});
