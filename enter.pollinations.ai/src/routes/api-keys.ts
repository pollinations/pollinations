import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth.ts";
import { authenticateSession } from "@/middleware/authenticate.ts";
import type { Env } from "../env.ts";

export const apiKeysRoutes = new Hono<Env>()
    .use("*", authenticateSession)
    .get("/list", async (c) => {
        const { user } = c.var.auth.requireAuth();
        
        const db = drizzle(c.env.DB);
        const apiKeys = await db
            .select()
            .from(schema.apiKey)
            .where(eq(schema.apiKey.userId, user.id));
        
        return c.json(apiKeys);
    });

export type ApiKeysRoutes = typeof apiKeysRoutes;
