import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import { user as userTable } from "../db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { createX402Middleware } from "../middleware/x402.ts";

// Helper to credit pollen
async function creditPollen(env: Env["Bindings"], userId: string, amount: number) {
    const db = drizzle(env.DB);
    // Apply 2x beta bonus
    const pollenAmount = amount * 2;
    
    await db
        .update(userTable)
        .set({
            cryptoBalance: sql`COALESCE(${userTable.cryptoBalance}, 0) + ${pollenAmount}`,
        })
        .where(eq(userTable.id, userId));
    
    return pollenAmount;
}

export const cryptoRoutes = new Hono<Env>()
    // Apply x402 middleware to all topup routes
    .use("/topup/*", async (c, next) => {
        const middleware = createX402Middleware(c.env);
        return middleware(c, next);
    })
    
    .post("/topup/:amount", async (c) => {
        const amountStr = c.req.param("amount");
        const validAmounts = ["5", "10", "20", "50"];
        
        if (!validAmounts.includes(amountStr)) {
            return c.json({ error: "Invalid amount" }, 400);
        }

        const amount = parseInt(amountStr);

        // Authenticate user
        const auth = createAuth(c.env, c.executionCtx);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session?.user?.id) {
            return c.json({ error: "Authentication required" }, 401);
        }

        // Credit pollen
        try {
            const credited = await creditPollen(c.env, session.user.id, amount);
            return c.json({ 
                success: true, 
                message: `Credited ${credited} pollen`,
                pollenCredited: credited 
            });
        } catch (error) {
            console.error("Failed to credit pollen:", error);
            return c.json({ error: "Internal server error" }, 500);
        }
    });
