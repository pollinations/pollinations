import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { isAdminUser } from "../../auth.ts";
import type { Env } from "../../env.ts";
import { auth } from "../../middleware/auth.ts";
import { economicsRoutes } from "./economics.ts";
import { kpiRoutes } from "./kpi.ts";

export const dashboardRoutes = new Hono<Env>()
    .use("*", async (c, next) => {
        c.header("Cache-Control", "private, no-store");
        await next();
    })
    .use("*", auth({ allowSessionCookie: true, allowApiKey: false }))
    .use("*", async (c, next) => {
        if (!isAdminUser(c.var.auth.requireUser())) {
            throw new HTTPException(403, { message: "Admin access required" });
        }
        await next();
    })
    .route("/economics", economicsRoutes)
    .route("/kpi", kpiRoutes);
