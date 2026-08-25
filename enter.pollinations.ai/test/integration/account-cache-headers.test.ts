import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Account route cache headers", () => {
    test("GET /api/account/profile returns no-store cache headers", async ({
        sessionToken,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe(
            "private, no-store, max-age=0",
        );
        expect(response.headers.get("Pragma")).toBe("no-cache");
    });

    test("GET /api/account/my-models returns no-store cache headers", async ({
        sessionToken,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/my-models",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        // The route may return 404 if the user has no community models,
        // but cache headers should still be set on any response.
        expect(response.headers.get("Cache-Control")).toBe(
            "private, no-store, max-age=0",
        );
        expect(response.headers.get("Pragma")).toBe("no-cache");
    });
});
