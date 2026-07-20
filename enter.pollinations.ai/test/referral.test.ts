import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("tracks the image referral", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=image",
        { method: "POST" },
    );

    expect(response.status).toBe(204);
    expect(mocks.tinybird.state.referralEvents).toEqual([
        expect.objectContaining({ ref: "image" }),
    ]);
});

test("does not track unknown referrals", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=unknown",
        { method: "POST" },
    );

    expect(response.status).toBe(204);
    expect(mocks.tinybird.state.referralEvents).toEqual([]);
});
