import { env, SELF } from "cloudflare:test";
import { apikey, session as sessionTable } from "@shared/db/better-auth.ts";
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
            .toEqual([
                expect.objectContaining({
                    ref,
                    metadata: '{"logged_in":false}',
                }),
            ]);
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
            .toEqual([
                {
                    timestamp: expect.any(String),
                    ref,
                    metadata: '{"logged_in":true}',
                },
            ]);
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
        .toEqual([
            expect.objectContaining({ metadata: '{"logged_in":false}' }),
        ]);
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
        .toEqual([
            expect.objectContaining({ metadata: '{"logged_in":false}' }),
        ]);
});

test("records the key id and whether the visitor owns it", async ({
    mocks,
    sessionToken,
    apiKey,
}) => {
    await mocks.enable("tinybird");
    expect(apiKey).toBeTruthy();
    const [ownKey] = await drizzle(env.DB).select().from(apikey);
    const url = `http://localhost:3000/api/referral?ref=agent_low_balance_topup&key_id=${ownKey.id}`;

    // Signed in as the owner
    let response = await SELF.fetch(url, {
        method: "POST",
        headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([
            expect.objectContaining({
                metadata: JSON.stringify({
                    logged_in: true,
                    key_id: ownKey.id,
                    is_owner: true,
                }),
            }),
        ]);

    // Signed out: the key exists but the visitor is not verified as its owner
    response = await SELF.fetch(url, { method: "POST" });
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents.at(-1)?.metadata)
        .toBe(
            JSON.stringify({
                logged_in: false,
                key_id: ownKey.id,
                is_owner: false,
            }),
        );

    // Unknown key: recorded, ownership unknown
    response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_topup&key_id=doesnotexist",
        { method: "POST" },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents.at(-1)?.metadata)
        .toBe(
            JSON.stringify({
                logged_in: false,
                key_id: "doesnotexist",
                is_owner: null,
            }),
        );
});

test("drops a malformed key id", async ({ mocks }) => {
    await mocks.enable("tinybird");
    const response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_quests&key_id=not%20an%20id",
        { method: "POST" },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([
            expect.objectContaining({ metadata: '{"logged_in":false}' }),
        ]);
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
