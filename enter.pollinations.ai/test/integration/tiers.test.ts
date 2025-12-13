import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { expect } from "vitest";

const base = "http://localhost:3000/api/tiers";

// Test tiers endpoint authentication (similar to polar.test.ts pattern)
test("/view should return 401 when not authenticated", async ({ mocks }) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/view`, {
        method: "GET",
    });
    expect(response.status).toBe(401);
});

test("/view should return 200 when authenticated via session cookie", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/view`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status).toBe(200);

    // Verify response structure
    const data = (await response.json()) as {
        tier: string;
        tier_name?: string;
        daily_pollen?: number;
        next_refill_at_utc: string;
        has_polar_error: boolean;
    };

    expect(data).toBeDefined();
    expect(data.tier).toBeDefined();
    expect(typeof data.tier).toBe("string");
    expect(data.next_refill_at_utc).toBeDefined();
    expect(typeof data.has_polar_error).toBe("boolean");
});

test("/view should NOT be accessible via API key (session cookie only)", async ({
    apiKey,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/view`, {
        method: "GET",
        headers: {
            authorization: `Bearer ${apiKey}`,
        },
    });
    // Should return 401 because tiers route only allows session cookies
    expect(response.status).toBe(401);
});

test("/view returns valid tier status values", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/view`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { tier: string };
    const validTiers = ["none", "spore", "seed", "flower", "nectar", "router"];
    expect(validTiers).toContain(data.tier);
});

test("/view returns valid ISO timestamp for next_refill_at_utc", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(`${base}/view`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as { next_refill_at_utc: string };
    // Should be a valid ISO date string
    const date = new Date(data.next_refill_at_utc);
    expect(date.toString()).not.toBe("Invalid Date");
    // Should be in the future
    expect(date.getTime()).toBeGreaterThan(Date.now());
});
