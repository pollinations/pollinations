import { createMiddleware } from "hono/factory";
import type { Env } from "../env.ts";

export const setConnectingIp = createMiddleware<Env>(async (c, next) => {
    const ip =
        c.req.header("cf-connecting-ip") ||
        c.req.header("x-real-ip") ||
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        "unknown";
    c.set("connectingIp", ip);
    console.debug("Setting connecting IP:", ip);
    await next();
});
