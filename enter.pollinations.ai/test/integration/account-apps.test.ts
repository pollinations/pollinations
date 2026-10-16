import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("GET /api/account/apps", () => {
    test("session auth returns apps array (empty if none)", async ({
        accountToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
            {
                headers: {
                    Authorization: `Bearer ${accountToken}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as { apps: unknown[] };
        expect(Array.isArray(data.apps)).toBe(true);
    });

    test("returns 401 without auth", async () => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/apps",
        );

        expect(response.status).toBe(401);
    });

    test("githubId is included in /profile response", async ({
        accountToken,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Authorization: `Bearer ${accountToken}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(data).toHaveProperty("githubId");
    });
});
