import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

for (const ref of ["image", "balance_topup", "balance_quests"]) {
    test(`tracks the ${ref} referral`, async ({ mocks }) => {
        await mocks.enable("tinybird");

        const response = await SELF.fetch(
            `https://enter.pollinations.ai/api/referral?ref=${ref}`,
            { method: "POST" },
        );

        expect(response.status).toBe(204);
        expect(mocks.tinybird.state.referralEvents).toEqual([
            expect.objectContaining({ ref }),
        ]);
    });
}

test("does not track unknown referrals", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=unknown",
        { method: "POST" },
    );

    expect(response.status).toBe(204);
    expect(mocks.tinybird.state.referralEvents).toEqual([]);
});
