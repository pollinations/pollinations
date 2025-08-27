import type { Session, User } from "better-auth";
import { Factory } from "hono/factory";
import { createAuth } from "../auth.ts";

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        auth: ReturnType<typeof createAuth>;
        session?: Session;
        user?: User;
    };
};

const factory = new Factory<Env>();

export const auth = factory.createMiddleware(async (c, next) => {
    const auth = createAuth(c.env);
    c.set("auth", auth);

    const result = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    const session = result?.session;
    const user = result?.user;

    c.set("session", session);
    c.set("user", user);

    return next();
});
