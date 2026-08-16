import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const baseUrl = "http://localhost:3000/api";

async function seedCoupon(code: string, questId = "coupon:launch") {
    const response = await SELF.fetch(`${baseUrl}/admin/quest-coupons`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            code,
            questId,
            title: "Launch thank-you",
            rewardAmount: 2.5,
        }),
    });
    expect(response.status).toBe(200);
}

async function redeemCoupon(code: string, sessionToken?: string) {
    return await SELF.fetch(`${baseUrl}/quests/coupons/redeem`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(sessionToken && {
                Cookie: `better-auth.session_token=${sessionToken}`,
            }),
        },
        body: JSON.stringify({ code }),
    });
}

test("quest coupon records and immediately claims one reward per campaign", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const [userBefore] = await db
        .select({ id: schema.user.id, tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .limit(1);
    expect(userBefore).toBeDefined();

    await seedCoupon("launch-2026");

    const redeemed = await redeemCoupon(" launch-2026 ", sessionToken);
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toMatchObject({
        redeemed: true,
        questId: "coupon:launch",
        pollenAmount: 2.5,
        newBalance: (userBefore?.tierBalance ?? 0) + 2.5,
    });

    const duplicate = await redeemCoupon("LAUNCH-2026", sessionToken);
    expect(duplicate.status).toBe(409);

    const rewardRows = await db
        .select()
        .from(schema.rewards)
        .where(eq(schema.rewards.questId, "coupon:launch"));
    expect(rewardRows).toHaveLength(1);
    expect(rewardRows[0]).toMatchObject({
        userId: userBefore?.id,
        title: "Launch thank-you",
        pollenAmount: 2.5,
        balanceBucket: "tier",
    });
    expect(rewardRows[0]?.claimedAt).not.toBeNull();

    const [userAfter] = await db
        .select({ tierBalance: schema.user.tierBalance })
        .from(schema.user)
        .where(eq(schema.user.id, userBefore?.id ?? ""));
    expect(userAfter?.tierBalance).toBe((userBefore?.tierBalance ?? 0) + 2.5);
});

test("quest coupon requires a session and can be disabled", async ({
    sessionToken,
}) => {
    await seedCoupon("community-gift");
    expect((await redeemCoupon("community-gift")).status).toBe(401);

    const disabled = await SELF.fetch(`${baseUrl}/admin/quest-coupons`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: "community-gift" }),
    });
    expect(disabled.status).toBe(200);
    expect((await redeemCoupon("community-gift", sessionToken)).status).toBe(
        404,
    );
});
