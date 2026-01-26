import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { expect } from "vitest";

const base = "http://localhost:3000/api/customer";
const routes = ["/balance"];

test.for(
    routes,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const anonymousResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
    });
    expect(anonymousResponse.status).toBe(401);
    const sessionCookieResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        redirect: "manual",
    });

    // Customer balance route should return 200 with valid session
    expect(sessionCookieResponse.status).toBe(200);
});
