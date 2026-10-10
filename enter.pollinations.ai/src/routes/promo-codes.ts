import {
    claimReward,
    MAX_REWARD_AMOUNT,
    recordRewards,
    rewardKey,
} from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

// Event codes are short-lived, so they live in KV and expire with it.
const PROMO_CODE_PREFIX = "promo-code:";
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
// Crockford base32 without I, L, O and U, so codes read aloud stay unambiguous.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

type PromoCode = {
    eventId: string;
    title: string;
    pollenAmount: number;
    expiresAt: string;
};

/** Uppercases and strips separators, so "abcd-efgh" matches "ABCDEFGH". */
function normalizeCode(code: string): string {
    return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Eight random characters (40 bits), shown as XXXX-XXXX. */
function generateCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const chars = [...bytes].map((byte) => CODE_ALPHABET[byte % 32]);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

const createPromoCodeSchema = z.object({
    eventId: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
    title: z.string().trim().min(1).max(200),
    pollenAmount: z.number().positive().max(MAX_REWARD_AMOUNT),
    expiresAt: z.iso.datetime({ offset: true }).refine((value) => {
        const ms = new Date(value).getTime() - Date.now();
        // KV needs at least 60 seconds of lifetime.
        return ms >= 60_000 && ms <= MAX_EXPIRY_MS;
    }, "expiresAt must be between 1 minute and 30 days from now"),
});

/** Creates one event code. Authentication is enforced by the parent admin route. */
export const promoCodeAdminRoutes = new Hono<Env>().post(
    "/",
    validator("json", createPromoCodeSchema),
    async (c) => {
        const input = c.req.valid("json");
        const code = generateCode();
        const promo: PromoCode = {
            eventId: input.eventId,
            title: input.title,
            pollenAmount: input.pollenAmount,
            expiresAt: new Date(input.expiresAt).toISOString(),
        };
        await c.env.KV.put(
            `${PROMO_CODE_PREFIX}${normalizeCode(code)}`,
            JSON.stringify(promo),
            {
                expiration: Math.floor(
                    new Date(promo.expiresAt).getTime() / 1000,
                ),
            },
        );
        return c.json({ code, ...promo });
    },
);

const redeemPromoCodeSchema = z.object({
    code: z.string().trim().min(1).max(64),
});

/**
 * Redeems an event code once per GitHub identity. The grant goes through the
 * reward ledger, whose idempotency key blocks a second redemption.
 */
export const promoCodeRedeemRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: false, allowApiKey: true }))
    .post("/redeem", validator("json", redeemPromoCodeSchema), async (c) => {
        await c.var.auth.requireAuthorization({
            message: "Authentication required to redeem a code",
        });
        if (c.var.auth.apiKey) {
            throw new HTTPException(403, {
                message: "Codes can only be redeemed from the dashboard",
            });
        }
        const user = c.var.auth.requireUser();
        if (user.githubId == null) {
            throw new HTTPException(403, {
                message: "Redeeming a code requires a GitHub account",
            });
        }

        const { code } = c.req.valid("json");
        const promo = await c.env.KV.get<PromoCode>(
            `${PROMO_CODE_PREFIX}${normalizeCode(code)}`,
            "json",
        );
        // One message for unknown and expired codes, so codes can't be probed.
        if (!promo || new Date(promo.expiresAt).getTime() <= Date.now()) {
            throw new HTTPException(404, {
                message: "This code is invalid or has expired",
            });
        }

        const db = drizzle(c.env.DB, { schema });
        const questId = `promo:${promo.eventId}`;
        const { rewardIds } = await recordRewards(db, [
            {
                idempotencyKey: rewardKey(questId, user.githubId),
                userId: user.id,
                amount: promo.pollenAmount,
                bucket: "tier",
                questId,
                title: promo.title,
            },
        ]);
        const [rewardId] = rewardIds;
        if (!rewardId) {
            throw new HTTPException(409, {
                message: "You have already redeemed a code for this event",
            });
        }

        const result = await claimReward(db, { rewardId, userId: user.id });
        return c.json({
            eventId: promo.eventId,
            pollenAmount: promo.pollenAmount,
            claimed: result.claimed,
            newBalance: result.newBalance,
        });
    });
