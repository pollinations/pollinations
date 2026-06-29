import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { runD1TinybirdSync } from "../services/d1-tinybird-sync.ts";

export const adminRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        const authHeader = c.req.header("Authorization");
        const providedKey = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        if (!providedKey) {
            throw new HTTPException(401, { message: "Unauthorized" });
        }

        // Full admin token has access to all endpoints
        if (providedKey === c.env.PLN_ENTER_TOKEN) {
            return await next();
        }

        // Tinybird sync token: authenticates the GH Action AND is used for Tinybird API calls
        const syncToken = c.env.TINYBIRD_SYNC_TOKEN;
        if (
            syncToken &&
            providedKey === syncToken &&
            c.req.path.endsWith("/trigger-d1-sync")
        ) {
            return await next();
        }

        throw new HTTPException(401, { message: "Unauthorized" });
    })
    .post("/trigger-d1-sync", async (c) => {
        const syncToken = c.env.TINYBIRD_SYNC_TOKEN;
        if (!syncToken) {
            throw new HTTPException(500, {
                message: "TINYBIRD_SYNC_TOKEN not configured",
            });
        }

        const results = await runD1TinybirdSync(c.env.DB, syncToken);
        const hasErrors = results.some((r) => r.status === "error");

        return c.json(
            { success: !hasErrors, tables: results },
            hasErrors ? 207 : 200,
        );
    });
