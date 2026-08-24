import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

/**
 * Authenticated account responses must never be stored by browsers or
 * intermediary caches. The policy is applied once at the account
 * router, every route under /account — including nested agent and
 * community-model routes — inherits it.
 */
describe("account routes cache-control policy", () => {
    test("top-level account response is no-store headers", async ({
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

    test("nested account response returns no-store headers", async ({
        sessionToken,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/agents",
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
});
