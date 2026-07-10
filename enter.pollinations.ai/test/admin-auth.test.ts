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

    test("should allow full admin token access to trigger d1 sync", async ({
        mocks,
    }) => {
        await mocks.enable("tinybird");

        const response = await SELF.fetch(
            `${baseUrl}/api/admin/trigger-d1-sync`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                },
            },
        );
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
            success: boolean;
            tables: Array<{ datasource: string; status: string }>;
        };
        expect(body.success).toBe(true);
        expect(body.tables.every((t) => t.status === "ok")).toBe(true);
    });
});
