import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";

const DASHBOARD_ORIGINS = [
    "https://economics.pollinations.ai",
    "https://kpi.pollinations.ai",
];
const LOCAL_ORIGINS = ["http://127.0.0.1:4180", "http://127.0.0.1:3456"];

export const apiCors = createMiddleware<Env>(async (c, next) => {
    const origin = c.req.header("Origin") || "";
    const dashboardOrigin =
        DASHBOARD_ORIGINS.includes(origin) ||
        (c.env.ENVIRONMENT !== "production" && LOCAL_ORIGINS.includes(origin));
    const credentials =
        dashboardOrigin &&
        (c.req.path.startsWith("/api/auth/") ||
            c.req.path.startsWith("/api/dashboards/"));
    // Keep public API CORS unchanged. Only dashboard/session requests from
    // these two frontends may use the host-only Enter session cookie.
    return cors({
        origin: credentials ? origin : "*",
        credentials,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: [],
        exposeHeaders: ["Content-Length", "Content-Disposition"],
        maxAge: 600,
    })(c, next);
});
