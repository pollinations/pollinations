import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/better-auth.ts";
import { auth } from "@/middleware/auth.ts";
import type { Env } from "../env.ts";

export const apiKeysRoutes = new Hono<Env>()
    .use("*", auth({ allowSessionCookie: true, allowApiKey: false }))
    .get("/list", async (c) => {
        const user = c.var.auth.requireUser();
        
        const db = drizzle(c.env.DB);
        const apiKeys = await db
            .select()
            .from(schema.apikey)
            .where(eq(schema.apikey.userId, user.id));
        
        // Better-auth automatically parses JSON metadata from the database
        // No manual parsing needed - the metadata field is already an object
        return c.json(apiKeys);
    });

export type ApiKeysRoutes = typeof apiKeysRoutes;
