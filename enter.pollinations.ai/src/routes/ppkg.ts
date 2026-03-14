import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as schema from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";

const PPKG_NAME = "pollinations_playground";

function generateSecretKey(): string {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return `sk_${Array.from(bytes, (b) => chars[b % chars.length]).join("")}`;
}

const PpkgQuerySchema = z.object({
    user_id: z.string().transform((s) => Number(s)),
});

export const ppkgRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: false }))
    .get("/", async (c) => {
        await c.var.auth.requireAuthorization();
        const parsed = PpkgQuerySchema.safeParse(c.req.query());
        if (!parsed.success) {
            throw new HTTPException(400, { message: "user_id required" });
        }
        const { user_id: githubId } = parsed.data;
        const db = drizzle(c.env.DB, { schema: schema });
        const targetUser = await db.query.user.findFirst({
            where: eq(schema.user.githubId, githubId),
        });
        if (!targetUser) {
            throw new HTTPException(404, { message: "User not found" });
        }
        const existing = await db.query.apikey.findFirst({
            where: and(
                eq(schema.apikey.userId, targetUser.id),
                eq(schema.apikey.name, PPKG_NAME),
            ),
        });
        if (existing) {
            await db
                .delete(schema.apikey)
                .where(eq(schema.apikey.id, existing.id));
            await c.env.KV.delete(`auth:api-key:${existing.id}`);
            if (existing.key) {
                await c.env.KV.delete(`auth:api-key:${existing.key}`);
            }
        }
        const id = crypto.randomUUID();
        const fullKey = generateSecretKey();
        const now = new Date();
        await db.insert(schema.apikey).values({
            id,
            name: PPKG_NAME,
            start: fullKey.slice(0, 13),
            prefix: "sk",
            key: fullKey,
            userId: targetUser.id,
            enabled: true,
            createdAt: now,
            updatedAt: now,
            permissions: "{}",
            metadata: "{}",
        });
        await c.env.KV.put(`auth:api-key:${fullKey}`, id);
        await c.env.KV.put(`auth:api-key:${id}`, fullKey);
        return c.json({ key: fullKey });
    });
