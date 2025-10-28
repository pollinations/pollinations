import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { products } from "@/routes/polar.ts";
import { expect } from "vitest";

const base = "http://localhost:3000/api/polar";
const customerRoutes = [
    "/customer/state",
    "/customer/events",
    "/customer/portal",
];
const checkoutRoutes = Object.keys(products).map((slug) => `/checkout/${slug}`);
const routes = [...customerRoutes, ...checkoutRoutes];

test.for(routes)(
    "%s should only be accessible when authenticated via session cookie",
    async (route, { sessionToken }) => {
        const anonymousResponse = await SELF.fetch(`${base}${route}`, {
            method: "GET",
        });
        expect(anonymousResponse.status).toBe(401);
        const sessionCookieResponse = await SELF.fetch(`${base}${route}`, {
            method: "GET",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        expect(sessionCookieResponse.status).toBe(200);
    },
);
