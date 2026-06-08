import { Hono } from "hono";
import type { Env } from "../env.ts";
import { getPublicSocialProviders } from "../social-providers.ts";

export const authProviderRoutes = new Hono<Env>().get("/", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ providers: getPublicSocialProviders(c.env) });
});
