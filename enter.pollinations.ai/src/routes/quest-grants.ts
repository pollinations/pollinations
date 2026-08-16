import { MAX_REWARD_AMOUNT, recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { validator } from "@shared/middleware/validator.ts";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.ts";

const githubUsernameSchema = z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/);

const grantRewardsSchema = z.object({
    campaignId: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
    title: z.string().trim().min(1).max(200),
    pollenAmount: z.number().positive().max(MAX_REWARD_AMOUNT),
    sourceUrl: z
        .url()
        .refine((value) =>
            ["http:", "https:"].includes(new URL(value).protocol),
        )
        .optional(),
    githubUsernames: z.array(githubUsernameSchema).min(1).max(100),
});

/** Bulk contributor grants. Authentication is enforced by the parent admin route. */
export const questGrantAdminRoutes = new Hono<Env>().post(
    "/",
    validator("json", grantRewardsSchema),
    async (c) => {
        const input = c.req.valid("json");
        const requested = [
            ...new Set(input.githubUsernames.map((name) => name.toLowerCase())),
        ];
        const db = drizzle(c.env.DB, { schema });
        const users = await db
            .select({
                id: schema.user.id,
                githubUsername: schema.user.githubUsername,
            })
            .from(schema.user)
            .where(
                inArray(
                    sql<string>`lower(${schema.user.githubUsername})`,
                    requested,
                ),
            );
        const usersByLogin = new Map(
            users.flatMap((user) =>
                user.githubUsername
                    ? [[user.githubUsername.toLowerCase(), user] as const]
                    : [],
            ),
        );
        const matched = requested.flatMap((login) => {
            const user = usersByLogin.get(login);
            return user ? [user] : [];
        });
        const questId = `grant:${input.campaignId}`;
        const result = await recordRewards(
            db,
            matched.map((user) => ({
                idempotencyKey: `quest:${questId}:user:${user.id}`,
                userId: user.id,
                amount: input.pollenAmount,
                bucket: "tier",
                questId,
                title: input.title,
                url: input.sourceUrl,
            })),
        );

        return c.json({
            campaignId: input.campaignId,
            matched: matched.length,
            recorded: result.recorded,
            missing: requested.filter((login) => !usersByLogin.has(login)),
        });
    },
);
