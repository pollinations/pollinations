import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("tracks the legacy image referral and redirects", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=legacy-image-error",
        { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
        "https://enter.pollinations.ai/",
    );
    expect(mocks.tinybird.state.referralEvents).toEqual([
        expect.objectContaining({ ref: "legacy-image-error" }),
    ]);
});

test("does not track unknown referrals", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=unknown",
        { redirect: "manual" },
    );

    expect(response.status).toBe(302);
    expect(mocks.tinybird.state.referralEvents).toEqual([]);
});
