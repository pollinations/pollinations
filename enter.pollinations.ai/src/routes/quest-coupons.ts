import {
    claimReward,
    MAX_REWARD_AMOUNT,
    recordRewards,
} from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { rewards } from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const COUPON_KEY_PREFIX = "quest-coupon:";
const couponCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;

const couponDefinitionSchema = z.object({
    questId: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9:_-]{0,99}$/),
    title: z.string().trim().min(1).max(200),
    rewardAmount: z.number().positive().max(MAX_REWARD_AMOUNT),
});

const couponCodeSchema = z.object({ code: z.string().trim().min(1).max(64) });
const couponInputSchema = couponDefinitionSchema.extend({
    code: z.string().trim().min(1).max(64),
});

type CouponDefinition = z.infer<typeof couponDefinitionSchema>;

function normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase();
    if (!couponCodePattern.test(normalized)) {
        throw new HTTPException(400, { message: "Invalid quest code" });
    }
    return normalized;
}

function couponKey(code: string): string {
    return `${COUPON_KEY_PREFIX}${normalizeCode(code)}`;
}

async function loadCoupon(
    kv: KVNamespace,
    code: string,
): Promise<CouponDefinition | null> {
    const stored = await kv.get<unknown>(couponKey(code), "json");
    const parsed = couponDefinitionSchema.safeParse(stored);
    return parsed.success ? parsed.data : null;
}

/** Hidden quest rewards redeemed by a dashboard user. */
export const questCouponRoutes = new Hono<Env>().post(
    "/redeem",
    auth({ allowApiKey: true, allowSessionCookie: true }),
    validator("json", couponCodeSchema),
    async (c) => {
        await c.var.auth.requireAuthorization({
            message: "Authentication required to redeem a quest code",
        });
        if (c.var.auth.apiKey) {
            throw new HTTPException(403, {
                message: "Quest codes require a dashboard session",
            });
        }

        const user = c.var.auth.requireUser();
        const { code } = c.req.valid("json");
        const coupon = await loadCoupon(c.env.KV, code);
        if (!coupon) {
            throw new HTTPException(404, { message: "Quest code not found" });
        }

        const db = drizzle(c.env.DB, { schema });
        const idempotencyKey = `quest:${coupon.questId}:user:${user.id}`;
        const recorded = await recordRewards(db, [
            {
                idempotencyKey,
                userId: user.id,
                amount: coupon.rewardAmount,
                bucket: "tier",
                questId: coupon.questId,
                title: coupon.title,
            },
        ]);

        const rewardId =
            recorded.rewardIds[0] ??
            (
                await db
                    .select({ id: rewards.id })
                    .from(rewards)
                    .where(eq(rewards.idempotencyKey, idempotencyKey))
                    .limit(1)
            )[0]?.id;
        if (!rewardId) {
            throw new HTTPException(500, {
                message: "Could not record quest reward",
            });
        }

        const result = await claimReward(db, { rewardId, userId: user.id });
        if (!result.claimed) {
            throw new HTTPException(409, {
                message: "Quest code already redeemed",
            });
        }

        return c.json({
            redeemed: true,
            questId: coupon.questId,
            pollenAmount: coupon.rewardAmount,
            newBalance: result.newBalance,
        });
    },
);

/** Minimal operator API: PUT creates/updates a campaign; DELETE disables it. */
export const questCouponAdminRoutes = new Hono<Env>()
    .put("/", validator("json", couponInputSchema), async (c) => {
        const { code: rawCode, ...coupon } = c.req.valid("json");
        const code = normalizeCode(rawCode);
        await c.env.KV.put(couponKey(code), JSON.stringify(coupon));
        return c.json({ code, coupon });
    })
    .delete("/", validator("json", couponCodeSchema), async (c) => {
        const code = normalizeCode(c.req.valid("json").code);
        await c.env.KV.delete(couponKey(code));
        return c.json({ code, coupon: null });
    });
