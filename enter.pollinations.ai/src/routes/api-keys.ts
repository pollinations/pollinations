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
            .from(schema.apikey)
            .where(eq(schema.apikey.userId, user.id));
        
        console.log('[API KEYS LIST] Raw from DB:', JSON.stringify(apiKeys.map(k => ({
            id: k.id,
            name: k.name,
            metadata: k.metadata,
            metadataType: typeof k.metadata
        })), null, 2));
        
        // Parse metadata - it's double-stringified, so parse twice
        const keysWithParsedMetadata = apiKeys.map(key => {
            if (!key.metadata) return { ...key, metadata: null };
            
            let parsed = key.metadata;
            // Parse once
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }
            // Parse again if still a string (double-stringified)
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }
            
            return { ...key, metadata: parsed };
        });
        
        console.log('[API KEYS LIST] After parsing:', JSON.stringify(keysWithParsedMetadata.map(k => ({
            id: k.id,
            name: k.name,
            metadata: k.metadata
        })), null, 2));
        
        return c.json(keysWithParsedMetadata);
    });

export type ApiKeysRoutes = typeof apiKeysRoutes;
