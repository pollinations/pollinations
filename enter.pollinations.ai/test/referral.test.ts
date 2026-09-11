import { env, SELF } from "cloudflare:test";
import { session as sessionTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

for (const ref of [
    "image",
    "agent_low_balance_topup",
    "agent_low_balance_quests",
]) {
    test(`tracks the ${ref} referral`, async ({ mocks }) => {
        await mocks.enable("tinybird");

        const response = await SELF.fetch(
            `https://enter.pollinations.ai/api/referral?ref=${ref}`,
            { method: "POST" },
        );

        expect(response.status).toBe(204);
        await expect
            .poll(() => mocks.tinybird.state.referralEvents)
            .toEqual([expect.objectContaining({ ref, logged_in: false })]);
    });

    test(`tracks a signed-in ${ref} referral`, async ({
        mocks,
        sessionToken,
    }) => {
        await mocks.enable("tinybird");
        const response = await SELF.fetch(
            `http://localhost:3000/api/referral?ref=${ref}`,
            {
                method: "POST",
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        expect(response.status).toBe(204);
        await expect
            .poll(() => mocks.tinybird.state.referralEvents)
            .toEqual([{ timestamp: expect.any(String), ref, logged_in: true }]);
    });
}

test("an expired session counts as signed out", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("tinybird");
    await drizzle(env.DB)
        .update(sessionTable)
        .set({ expiresAt: new Date(0) });
    const response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_topup",
        {
            method: "POST",
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([expect.objectContaining({ logged_in: false })]);
});

test("an API key alone does not count as a signed-in visitor", async ({
    mocks,
    apiKey,
}) => {
    await mocks.enable("tinybird");
    const response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_topup",
        { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([expect.objectContaining({ logged_in: false })]);
});

test("does not track unknown referrals", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=unknown",
        { method: "POST" },
    );

    expect(response.status).toBe(204);
    await expect.poll(() => mocks.tinybird.state.referralEvents).toEqual([]);
});
