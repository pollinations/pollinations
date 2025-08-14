import { Hono } from "hono";
import { createAuth } from "./auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { processPolarEvents } from "./polar.ts";
import * as eventSchema from "./db/schema/event.ts";

type Env = {
    Bindings: Cloudflare.Env;
};

const app = new Hono<Env>()
    .on(["POST", "GET"], "/api/v1/auth/*", (c) => {
        return createAuth(c.env).handler(c.req.raw);
    })
    .get("/", async (c) => {
        const auth = createAuth(c.env);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });
        return c.text(`Hello, ${JSON.stringify(session?.user, null, 2)}`);
    })
    .get("/text", async (c) => {
        const auth = createAuth(c.env);
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        });
        const db = drizzle(c.env.DB, { schema: eventSchema });
    });

export default {
    fetch: app.fetch,
    scheduled: (_controller, env, _ctx) => processPolarEvents(env),
} satisfies ExportedHandler<Cloudflare.Env>;
