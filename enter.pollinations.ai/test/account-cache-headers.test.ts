import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

const CACHE_CONTROL = "private, no-store, max-age=0";
const PRAGMA = "no-cache";

describe("account route cache headers", () => {
    test("top-level /account/profile is not cacheable", async ({
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
        expect(response.headers.get("cache-control")).toBe(CACHE_CONTROL);
        expect(response.headers.get("pragma")).toBe(PRAGMA);
    });

    test("nested /account/my-models is not cacheable", async ({
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

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(CACHE_CONTROL);
        expect(response.headers.get("pragma")).toBe(PRAGMA);
    });
});
