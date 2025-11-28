import {
    SELF,
    env,
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test } from "../fixtures.ts";
import { productSlugs } from "@/routes/polar.ts";
import { describe, expect } from "vitest";
import worker from "@/index.ts";

const base = "http://localhost:3000/api/polar";
const generateBase = "http://localhost:3000/api/generate";
const customerRoutes = [
    "/customer/state",
    "/customer/events",
    "/customer/portal",
];
const checkoutRoutes = productSlugs.map((slug) => `/checkout/${slug}`);
const routes = [...customerRoutes, ...checkoutRoutes];

test.for(routes)(
    "%s should only be accessible when authenticated via session cookie",
    async (route, { sessionToken, mocks }) => {
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
        });
        expect(sessionCookieResponse.status).toBe(200);
    },
);

describe("Balance tracking", () => {
    test(
        "should record balance in events after successful request",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(`${generateBase}/v1/chat/completions`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [{ role: "user", content: "Say yes" }],
                    }),
                }),
                env,
                ctx,
            );
            expect(response.status).toBe(200);
            await response.text();
            await waitOnExecutionContext(ctx);

            // Verify event was recorded with balance data
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(1);
            expect(events[0].selectedMeterSlug).toBeDefined();
            // Mock returns meters with priority 200 (tier) and 100 (pack)
            // Tier has higher priority so should be selected
            expect(events[0].selectedMeterSlug).toBe("v1:meter:tier");
        },
    );

    test(
        "should record balances JSON with meter values",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(`${generateBase}/v1/chat/completions`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [{ role: "user", content: "Say no" }],
                    }),
                }),
                env,
                ctx,
            );
            expect(response.status).toBe(200);
            await response.text();
            await waitOnExecutionContext(ctx);

            // Verify the selected meter has the highest priority
            const events = mocks.tinybird.state.events;
            expect(events[0].selectedMeterSlug).toBe("v1:meter:tier");
            // Balances should be recorded as JSON object
            expect(events[0].balances).toBeDefined();
            const balances = events[0].balances as Record<string, number>;
            // Mock returns both tier (95) and pack (273.84) balances
            expect(balances["v1:meter:tier"]).toBeGreaterThan(0);
            expect(balances["v1:meter:pack"]).toBeGreaterThan(0);
        },
    );
});
