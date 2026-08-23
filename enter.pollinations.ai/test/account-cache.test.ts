import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.js";

const authHeaders = (token: string) => ({
    Cookie: `better-auth.session_token=${token}`,
});

test("GET /api/account/profile has no-cache headers", async ({
    sessionToken,
}) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/profile",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
        "private, no-store, max-age=0",
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
});

test("GET /api/account/agents has no-cache headers", async ({
    sessionToken,
}) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/agents",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
        "private, no-store, max-age=0",
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
});
