import { Hono } from "hono";
import { createAuth } from "./auth.ts";

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
    });

export default app;
