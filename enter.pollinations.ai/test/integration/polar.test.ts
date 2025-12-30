import { productSlugToUrlParam } from "@/routes/polar.ts";
import { packProductSlugs } from "@/utils/polar.ts";
import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

const base = "http://localhost:3000/api/polar";
const customerRoutes = [
    "/customer/state",
    "/customer/events",
    "/customer/portal",
    "/customer/balance",
];
const checkoutRoutes = packProductSlugs.map(
    (slug) => `/checkout/${productSlugToUrlParam(slug)}`,
);
const routes = [...customerRoutes, ...checkoutRoutes];

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
    expect(sessionCookieResponse.status).toBeOneOf([200, 302]);
});

test("/customer/balance should be accessible via API key", async ({
    apiKey,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/customer/balance`, {
        method: "GET",
        headers: {
            authorization: `Bearer ${apiKey}`,
        },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("effectiveBalance");
    expect(data).toHaveProperty("currentBalance");
    expect(data).toHaveProperty("pendingSpend");
});

test("/customer/balance should return correct balance structure", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/customer/balance`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.effectiveBalance).toBe("number");
    expect(typeof data.currentBalance).toBe("number");
    expect(typeof data.pendingSpend).toBe("number");
    // effectiveBalance should equal currentBalance minus pendingSpend
    expect(data.effectiveBalance).toBe(data.currentBalance - data.pendingSpend);
});
