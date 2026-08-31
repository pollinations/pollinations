import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

test("account responses send private no-store cache headers", async ({
    sessionToken,
}) => {
    const profile = await SELF.fetch(
        "http://localhost:3000/api/account/profile",
        { headers: authHeaders(sessionToken) },
    );
    expect(profile.status).toBe(200);
    expect(profile.headers.get("Cache-Control")).toBe(
        "private, no-store, max-age=0",
    );
    expect(profile.headers.get("Pragma")).toBe("no-cache");

    // Routes mounted under /account (agents, my-models) go through the same
    // router middleware, so they must inherit the policy too.
    const agents = await SELF.fetch(
        "http://localhost:3000/api/account/agents",
        {
            headers: authHeaders(sessionToken),
        },
    );
    expect(agents.status).toBe(200);
    expect(agents.headers.get("Cache-Control")).toBe(
        "private, no-store, max-age=0",
    );
    expect(agents.headers.get("Pragma")).toBe("no-cache");
});
