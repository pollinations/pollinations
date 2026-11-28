import { getRealClientIp, hashIp } from "@shared/client-ip.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { WITHDRAWAL_LIMITS, WITHDRAWAL_STATEMENT } from "@shared/withdrawal.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "../env.ts";
import { deliverWithdrawals } from "../services/withdrawals.ts";

const singleLine = (max: number) =>
    z
        .string()
        .trim()
        .min(1)
        .max(max)
        .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u);
const declaration = z.object({
    id: z.uuidv4(),
    name: singleLine(WITHDRAWAL_LIMITS.name),
    purchase: singleLine(WITHDRAWAL_LIMITS.purchase),
    email: z.email().max(WITHDRAWAL_LIMITS.email),
});

export const withdrawalRoutes = new Hono<Env>().post(
    "/",
    bodyLimit({ maxSize: 8192 }),
    async (c) => {
        c.header("Cache-Control", "no-store");
        const origin = c.req.header("Origin");
        if (origin && origin !== getPublicOrigin(c))
            return c.json(
                { error: "Use the withdrawal form on this site." },
                403,
            );
        if (
            c.req.header("Content-Type")?.split(";")[0].trim() !==
            "application/json"
        )
            return c.json(
                { error: "Expected a JSON withdrawal declaration." },
                415,
            );
        const parsed = declaration.safeParse(
            await c.req.json().catch(() => null),
        );
        if (!parsed.success)
            return c.json(
                {
                    error: "Check your name, purchase details, and receipt email.",
                },
                400,
            );

        const { id, name, email, purchase } = parsed.data;
        const now = Date.now();
        const since = now - 3_600_000;
        // Never store the raw IP. Forget the keyed value after the hourly quota expires.
        const ip = await hashIp(getRealClientIp(c), c.env.BETTER_AUTH_SECRET);
        const db = c.env.DB;
        const [, lookup] = await db.batch<{
            name: string;
            email: string;
            purchase: string;
            received_at: number;
        }>([
            db
                .prepare(`INSERT INTO withdrawal_request
                (id, name, email, purchase, statement, received_at, ip_key)
                SELECT ?, ?, ?, ?, ?, ?, ?
                WHERE (SELECT COUNT(*) FROM withdrawal_request WHERE ip_key = ? AND received_at > ?) < 20
                  AND (SELECT COUNT(*) FROM withdrawal_request WHERE email = ? AND received_at > ?) < 6
                ON CONFLICT(id) DO NOTHING`)
                .bind(
                    id,
                    name,
                    email,
                    purchase,
                    WITHDRAWAL_STATEMENT,
                    now,
                    ip,
                    ip,
                    since,
                    email,
                    since,
                ),
            db
                .prepare(
                    "SELECT received_at, name, email, purchase FROM withdrawal_request WHERE id = ?",
                )
                .bind(id),
        ]);
        const saved = lookup.results[0];
        if (!saved) {
            c.header("Retry-After", "3600");
            return c.json(
                {
                    error: "Too many submissions. Try again later or email billing@pollinations.ai.",
                },
                429,
            );
        }
        if (
            saved.name !== name ||
            saved.email !== email ||
            saved.purchase !== purchase
        )
            return c.json(
                { error: "Use a new reference for a different declaration." },
                409,
            );
        c.executionCtx.waitUntil(deliverWithdrawals(c.env, id));
        return c.json({
            id,
            receivedAt: new Date(saved.received_at).toISOString(),
        });
    },
);
